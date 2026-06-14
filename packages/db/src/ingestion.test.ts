import type { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.setConfig({ hookTimeout: 30_000 })

import type { Database } from "./index"
import { recordListen } from "./ingestion"
import { setupTestDb } from "./test-utils"

let client: PGlite
let db: Database

beforeAll(async () => {
  ;({ db, client } = await setupTestDb())
})

afterAll(async () => {
  await client.close()
})

describe("recordListen", () => {
  const listen = {
    artist: { name: "Radiohead", mbid: "a74b1b7f-71a5-4011-9441-d0b5e4122711" },
    album: {
      name: "OK Computer",
      mbid: "b0b45097-91e7-3731-86e1-3f3af4573a68",
    },
    track: {
      name: "Paranoid Android",
      mbid: "9186052c-3ab3-4a64-84e5-0e0b3a3e8301",
    },
    listenedAt: new Date("2024-01-15T20:30:00Z"),
    source: "lastfm" as const,
  }

  it("creates artist, album, track, and hum for a complete listen", async () => {
    const result = await recordListen(db, listen)

    expect(result.wasNew).toBe(true)
    expect(result.humId).toBeGreaterThan(0)
    expect(result.artistId).toBeGreaterThan(0)
    expect(result.albumId).toBeGreaterThan(0)
    expect(result.trackId).toBeGreaterThan(0)
  })

  it("returns wasNew: false and same IDs for duplicate listen", async () => {
    const first = await recordListen(db, listen)
    const second = await recordListen(db, listen)

    expect(second.wasNew).toBe(false)
    expect(second.humId).toBe(first.humId)
    expect(second.artistId).toBe(first.artistId)
    expect(second.albumId).toBe(first.albumId)
    expect(second.trackId).toBe(first.trackId)
  })

  it("handles a track with no album", async () => {
    const result = await recordListen(db, {
      artist: { name: "Burial" },
      track: { name: "Archangel" },
      listenedAt: new Date("2024-02-10T18:00:00Z"),
      source: "spotify",
    })

    expect(result.wasNew).toBe(true)
    expect(result.albumId).toBeNull()
    expect(result.trackId).toBeGreaterThan(0)
  })

  it("resolves entities without MBIDs", async () => {
    const result = await recordListen(db, {
      artist: { name: "Unknown Artist" },
      album: { name: "Unknown Album" },
      track: { name: "Unknown Track" },
      listenedAt: new Date("2024-03-01T12:00:00Z"),
      source: "tidal",
    })

    expect(result.wasNew).toBe(true)
    expect(result.artistId).toBeGreaterThan(0)
    expect(result.albumId).toBeGreaterThan(0)
    expect(result.trackId).toBeGreaterThan(0)

    // Same listen again — should still deduplicate
    const dup = await recordListen(db, {
      artist: { name: "Unknown Artist" },
      album: { name: "Unknown Album" },
      track: { name: "Unknown Track" },
      listenedAt: new Date("2024-03-01T12:00:00Z"),
      source: "tidal",
    })

    expect(dup.wasNew).toBe(false)
    expect(dup.artistId).toBe(result.artistId)
  })

  it("reuses artist and album across different tracks", async () => {
    const a = await recordListen(db, {
      artist: { name: "Aphex Twin" },
      album: { name: "Selected Ambient Works 85-92" },
      track: { name: "Xtal" },
      listenedAt: new Date("2024-04-01T10:00:00Z"),
      source: "lastfm",
    })

    const b = await recordListen(db, {
      artist: { name: "Aphex Twin" },
      album: { name: "Selected Ambient Works 85-92" },
      track: { name: "Ageispolis" },
      listenedAt: new Date("2024-04-01T10:05:00Z"),
      source: "lastfm",
    })

    expect(b.artistId).toBe(a.artistId)
    expect(b.albumId).toBe(a.albumId)
    expect(b.trackId).not.toBe(a.trackId)
    expect(b.humId).not.toBe(a.humId)
  })
})
