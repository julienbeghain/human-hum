import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const MIGRATIONS_DIR = join(import.meta.dirname, "../drizzle")

function applyMigration(client: PGlite, tag: string): Promise<void> {
  const sql = readFileSync(join(MIGRATIONS_DIR, `${tag}.sql`), "utf-8")
  return (async () => {
    for (const statement of sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean)) {
      await client.exec(statement)
    }
  })()
}

// The 0002 migration moves the legacy per-source marker columns into
// album_sources rows before dropping them. setupTestDb applies every migration
// against an empty database, so it never exercises the INSERT..SELECT data path;
// this test seeds legacy state between 0001 and 0002 to guard it.
describe("0002_album_sources data migration", () => {
  let client: PGlite

  beforeAll(async () => {
    client = new PGlite()
    await applyMigration(client, "0000_needy_selene")
    await applyMigration(client, "0001_tidal_enrichment_markers")

    await client.exec(`
      INSERT INTO "listen"."artists" ("name") VALUES ('Autechre');
      INSERT INTO "listen"."albums" ("name", "artist_id", "lastfm_enriched_at", "tidal_enriched_at")
      VALUES
        ('Both Passes', 1, '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z'),
        ('LastFM Only', 1, '2024-01-03T00:00:00Z', NULL),
        ('Un-enriched', 1, NULL, NULL);
    `)

    await applyMigration(client, "0002_album_sources")
  })

  afterAll(async () => {
    await client.close()
  })

  it("migrates a both-passes album to a matched lastfm row and an unmatched tidal row", async () => {
    const { rows } = await client.query<{ source: string; matched: boolean }>(
      `SELECT s.source, s.matched FROM "listen"."album_sources" s
       JOIN "listen"."albums" a ON a.id = s.album_id
       WHERE a.name = 'Both Passes' ORDER BY s.source`
    )
    expect(rows).toEqual([
      { source: "lastfm", matched: true },
      { source: "tidal", matched: false },
    ])
  })

  it("migrates a lastfm-only album to a single matched lastfm row", async () => {
    const { rows } = await client.query<{ source: string; matched: boolean }>(
      `SELECT s.source, s.matched FROM "listen"."album_sources" s
       JOIN "listen"."albums" a ON a.id = s.album_id
       WHERE a.name = 'LastFM Only'`
    )
    expect(rows).toEqual([{ source: "lastfm", matched: true }])
  })

  it("leaves an un-enriched album with no source rows", async () => {
    const { rows } = await client.query(
      `SELECT s.source FROM "listen"."album_sources" s
       JOIN "listen"."albums" a ON a.id = s.album_id
       WHERE a.name = 'Un-enriched'`
    )
    expect(rows).toHaveLength(0)
  })

  it("preserves the recorded enriched_at timestamp", async () => {
    const { rows } = await client.query<{ enriched_at: string }>(
      `SELECT s.enriched_at FROM "listen"."album_sources" s
       JOIN "listen"."albums" a ON a.id = s.album_id
       WHERE a.name = 'LastFM Only' AND s.source = 'lastfm'`
    )
    expect(new Date(rows[0]!.enriched_at).toISOString()).toBe(
      "2024-01-03T00:00:00.000Z"
    )
  })

  it("drops the legacy marker columns from albums", async () => {
    const { rows } = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'listen' AND table_name = 'albums'`
    )
    const columns = rows.map((r) => r.column_name)
    expect(columns).not.toContain("lastfm_enriched_at")
    expect(columns).not.toContain("tidal_enriched_at")
  })
})
