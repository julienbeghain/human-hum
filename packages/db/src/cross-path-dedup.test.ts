import type { PGlite } from "@electric-sql/pglite"
import { count } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.setConfig({ hookTimeout: 30_000 })

import type { Database } from "./index"
import {
  bulkIngest,
  listenInputFromSnapshot,
  recordListen,
  type ListenInput,
  type Source,
} from "./ingestion"
import type {
  FetchPageResult,
  SourceFetcher,
} from "./importers/source-fetcher"
import { importHums } from "./importers/source-fetcher"
import { exportHums } from "./queries"
import { parse, serialize } from "./snapshot"
import * as schema from "./schema"
import { setupTestDb } from "./test-utils"

let sourceClient: PGlite
let reseedClient: PGlite
let sourceDb: Database
let reseedDb: Database

beforeEach(async () => {
  ;({ db: sourceDb, client: sourceClient } = await setupTestDb())
  ;({ db: reseedDb, client: reseedClient } = await setupTestDb())
})

afterEach(async () => {
  await sourceClient.close()
  await reseedClient.close()
})

// Returns its pre-canned listens on page 1, ignoring the from/to window — the
// online path's job here is to feed an overlapping set through recordListen.
class FakeFetcher implements SourceFetcher {
  readonly source: Source = "lastfm"

  constructor(private readonly listens: ListenInput[]) {}

  async fetchPage(): Promise<FetchPageResult> {
    return { listens: this.listens, totalPages: 1, skippedCount: 0 }
  }
}

const history: ListenInput[] = [
  {
    artist: { name: "Radiohead", mbid: "a74b1b7f-71a5-4011-9441-d0b5e4122711" },
    album: { name: "OK Computer" },
    track: { name: "Paranoid Android" },
    listenedAt: new Date("2024-01-15T20:30:00.000Z"),
    source: "lastfm",
  },
  {
    artist: { name: "Burial" },
    track: { name: "Archangel" },
    listenedAt: new Date("2024-02-10T18:00:00.000Z"),
    source: "lastfm",
  },
  {
    artist: { name: "Aphex Twin" },
    album: { name: "Selected Ambient Works 85-92" },
    track: { name: "Xtal" },
    listenedAt: new Date("2024-03-01T12:00:00.000Z"),
    source: "lastfm",
  },
]

async function humCount(db: Database): Promise<number> {
  const [row] = await db.select({ value: count() }).from(schema.hums)
  return row?.value ?? 0
}

describe("cross-path dedup", () => {
  it("reseeds via bulkIngest, then an overlapping sync adds zero net-new hums", async () => {
    // Build a real snapshot from a populated source DB, then reseed it.
    for (const listen of history) await recordListen(sourceDb, listen)
    const exported = await exportHums(sourceDb)
    const { records } = parse(serialize(exported, new Date("2026-06-28T00:00:00.000Z")))
    const reseeded = await bulkIngest(
      reseedDb,
      records.map(listenInputFromSnapshot)
    )
    expect(reseeded.insertedHums).toBe(history.length)

    const before = await humCount(reseedDb)

    // A normal sync whose window overlaps the reseeded set: the fetcher reports
    // the same listens, with listened_at rebuilt independently from the same
    // ISO instants. recordListen must resolve (track_id, listened_at) to the
    // exact rows bulkIngest wrote, so every row conflicts and nothing inserts.
    const overlap = history.map((h) => ({
      ...h,
      listenedAt: new Date(h.listenedAt.toISOString()),
    }))
    const result = await importHums(reseedDb, new FakeFetcher(overlap), {})

    expect(result.totalImported).toBe(0)
    expect(result.totalSkipped).toBe(overlap.length)
    expect(await humCount(reseedDb)).toBe(before)
  })
})
