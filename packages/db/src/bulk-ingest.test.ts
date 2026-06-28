import type { PGlite } from "@electric-sql/pglite"
import { count, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.setConfig({ hookTimeout: 30_000 })

import type { Database } from "./index"
import { bulkIngest, type ListenInput } from "./ingestion"
import * as schema from "./schema"
import { setupTestDb } from "./test-utils"

let client: PGlite
let db: Database

beforeEach(async () => {
  ;({ db, client } = await setupTestDb())
})

afterEach(async () => {
  await client.close()
})

const radiohead: ListenInput = {
  artist: { name: "Radiohead", mbid: "a74b1b7f-71a5-4011-9441-d0b5e4122711" },
  album: { name: "OK Computer", mbid: "b0b45097-91e7-3731-86e1-3f3af4573a68" },
  track: {
    name: "Paranoid Android",
    mbid: "9186052c-3ab3-4a64-84e5-0e0b3a3e8301",
  },
  listenedAt: new Date("2024-01-15T20:30:00.000Z"),
  source: "lastfm",
}

const burial: ListenInput = {
  artist: { name: "Burial" },
  track: { name: "Archangel" },
  listenedAt: new Date("2024-02-10T18:00:00.000Z"),
  source: "spotify",
}

const aphex: ListenInput = {
  artist: { name: "Aphex Twin" },
  album: { name: "Selected Ambient Works 85-92" },
  track: { name: "Xtal" },
  listenedAt: new Date("2024-03-01T12:00:00.000Z"),
  source: "tidal",
}

describe("bulkIngest", () => {
  it("creates artists, albums, tracks, and hums from a batch", async () => {
    const result = await bulkIngest(db, [radiohead, burial, aphex])

    expect(result.insertedHums).toBe(3)
    expect(result.skippedHums).toBe(0)

    const [artists] = await db.select({ value: count() }).from(schema.artists)
    const [albums] = await db.select({ value: count() }).from(schema.albums)
    const [tracks] = await db.select({ value: count() }).from(schema.tracks)
    const [hums] = await db.select({ value: count() }).from(schema.hums)

    expect(artists?.value).toBe(3)
    expect(albums?.value).toBe(2) // Burial has no album
    expect(tracks?.value).toBe(3)
    expect(hums?.value).toBe(3)
  })

  it("reuses one artist and album across distinct tracks", async () => {
    const ageispolis: ListenInput = {
      artist: { name: "Aphex Twin" },
      album: { name: "Selected Ambient Works 85-92" },
      track: { name: "Ageispolis" },
      listenedAt: new Date("2024-03-01T12:05:00.000Z"),
      source: "tidal",
    }

    await bulkIngest(db, [aphex, ageispolis])

    const [artists] = await db.select({ value: count() }).from(schema.artists)
    const [albums] = await db.select({ value: count() }).from(schema.albums)
    const [tracks] = await db.select({ value: count() }).from(schema.tracks)

    expect(artists?.value).toBe(1)
    expect(albums?.value).toBe(1)
    expect(tracks?.value).toBe(2)
  })

  it("inserts zero rows on a second identical ingest", async () => {
    await bulkIngest(db, [radiohead, burial, aphex])
    const second = await bulkIngest(db, [radiohead, burial, aphex])

    expect(second.insertedHums).toBe(0)
    expect(second.skippedHums).toBe(3)

    const [hums] = await db.select({ value: count() }).from(schema.hums)
    expect(hums?.value).toBe(3)
  })

  it("reports correct inserted/skipped counts for a mixed batch", async () => {
    await bulkIngest(db, [radiohead, burial])

    const newAphex2: ListenInput = {
      ...aphex,
      track: { name: "Pulsewidth" },
      listenedAt: new Date("2024-03-02T12:00:00.000Z"),
    }

    const result = await bulkIngest(db, [radiohead, aphex, newAphex2])

    // radiohead already present, aphex + newAphex2 are new
    expect(result.insertedHums).toBe(2)
    expect(result.skippedHums).toBe(1)
  })

  it("is resumable: re-running after a partial run completes history without duplicates", async () => {
    const partial = await bulkIngest(db, [radiohead, burial])
    expect(partial.insertedHums).toBe(2)

    const full = await bulkIngest(db, [radiohead, burial, aphex])
    expect(full.insertedHums).toBe(1)
    expect(full.skippedHums).toBe(2)

    const [hums] = await db.select({ value: count() }).from(schema.hums)
    expect(hums?.value).toBe(3)
  })

  it("ingests across multiple chunks identically to a single chunk", async () => {
    const inputs: ListenInput[] = Array.from({ length: 12 }, (_, i) => ({
      artist: { name: `Artist ${i % 3}` },
      album: { name: `Album ${i % 3}` },
      track: { name: `Track ${i}` },
      listenedAt: new Date(Date.UTC(2024, 0, 1, 0, i)),
      source: "lastfm",
    }))

    const result = await bulkIngest(db, inputs, { chunkSize: 5 })

    expect(result.insertedHums).toBe(12)

    const [artists] = await db.select({ value: count() }).from(schema.artists)
    const [tracks] = await db.select({ value: count() }).from(schema.tracks)
    const [hums] = await db.select({ value: count() }).from(schema.hums)

    expect(artists?.value).toBe(3)
    expect(tracks?.value).toBe(12)
    expect(hums?.value).toBe(12)
  })

  it("deduplicates identical hums within a single batch", async () => {
    const result = await bulkIngest(db, [radiohead, radiohead])

    expect(result.insertedHums).toBe(1)
    expect(result.skippedHums).toBe(1)

    const [hums] = await db.select({ value: count() }).from(schema.hums)
    expect(hums?.value).toBe(1)
  })

  it("does not touch recordListen state", async () => {
    const empty = await bulkIngest(db, [])
    expect(empty.insertedHums).toBe(0)
    expect(empty.skippedHums).toBe(0)
  })

  it("distinguishes same track name under different artists", async () => {
    const a: ListenInput = {
      artist: { name: "Artist A" },
      track: { name: "Intro" },
      listenedAt: new Date("2024-01-01T00:00:00.000Z"),
      source: "lastfm",
    }
    const b: ListenInput = {
      artist: { name: "Artist B" },
      track: { name: "Intro" },
      listenedAt: new Date("2024-01-01T00:01:00.000Z"),
      source: "lastfm",
    }

    await bulkIngest(db, [a, b])

    const tracks = await db
      .select({ id: schema.tracks.id, artistId: schema.tracks.artistId })
      .from(schema.tracks)
      .where(eq(schema.tracks.name, "Intro"))

    expect(tracks).toHaveLength(2)
  })
})
