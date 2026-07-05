import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.setConfig({ hookTimeout: 30_000 })

import type { Database } from "./index"
import { recordListen } from "./ingestion"
import { albums, albumSources, albumTracks } from "./schema"
import { setupTestDb } from "./test-utils"

let client: PGlite
let db: Database

let albumId: number
let trackId: number

beforeAll(async () => {
  ;({ db, client } = await setupTestDb())

  const r = await recordListen(db, {
    artist: { name: "Boards of Canada" },
    track: { name: "Roygbiv" },
    album: { name: "Music Has the Right to Children" },
    listenedAt: new Date("2024-05-01T10:00:00Z"),
    source: "lastfm",
  })
  albumId = r.albumId!
  trackId = r.trackId
})

afterAll(async () => {
  await client.close()
})

describe("albums enrichment columns", () => {
  it("image_url defaults to null", async () => {
    const [row] = await db
      .select({ imageUrl: albums.imageUrl })
      .from(albums)
      .where(eq(albums.id, albumId))

    expect(row!.imageUrl).toBeNull()
  })

  it("can set image_url", async () => {
    await db
      .update(albums)
      .set({ imageUrl: "https://example.com/art.jpg" })
      .where(eq(albums.id, albumId))

    const [row] = await db
      .select({ imageUrl: albums.imageUrl })
      .from(albums)
      .where(eq(albums.id, albumId))

    expect(row!.imageUrl).toBe("https://example.com/art.jpg")

    // Reset for other tests
    await db
      .update(albums)
      .set({ imageUrl: null })
      .where(eq(albums.id, albumId))
  })
})

describe("album_sources table", () => {
  it("records a completed pass as one row per (album, source)", async () => {
    const enrichedAt = new Date()
    await db.insert(albumSources).values([
      { albumId, source: "lastfm", enrichedAt, matched: true },
      { albumId, source: "tidal", enrichedAt, matched: false },
    ])

    const rows = await db
      .select()
      .from(albumSources)
      .where(eq(albumSources.albumId, albumId))

    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.source === "lastfm")).toMatchObject({
      albumId,
      matched: true,
    })
    expect(rows.find((r) => r.source === "tidal")).toMatchObject({
      albumId,
      matched: false,
    })
  })

  it("enforces composite PK (album_id, source)", async () => {
    await expect(
      db.insert(albumSources).values({
        albumId,
        source: "lastfm",
        enrichedAt: new Date(),
        matched: true,
      })
    ).rejects.toThrow()
  })
})

describe("album_tracks table", () => {
  it("inserts a track with all fields", async () => {
    await db.insert(albumTracks).values({
      albumId,
      trackNumber: 1,
      name: "Wildlife Analysis",
      trackId,
      duration: 373,
    })

    const [row] = await db
      .select()
      .from(albumTracks)
      .where(eq(albumTracks.albumId, albumId))

    expect(row).toMatchObject({
      albumId,
      trackNumber: 1,
      name: "Wildlife Analysis",
      trackId,
      duration: 373,
    })
  })

  it("allows null track_id for tracks without hums", async () => {
    await db.insert(albumTracks).values({
      albumId,
      trackNumber: 2,
      name: "An Eagle in Your Mind",
      trackId: null,
      duration: 393,
    })

    const [row] = await db
      .select()
      .from(albumTracks)
      .where(eq(albumTracks.trackNumber, 2))

    expect(row!.trackId).toBeNull()
    expect(row!.name).toBe("An Eagle in Your Mind")
  })

  it("allows null duration", async () => {
    await db.insert(albumTracks).values({
      albumId,
      trackNumber: 3,
      name: "The Color of the Fire",
      duration: null,
    })

    const [row] = await db
      .select()
      .from(albumTracks)
      .where(eq(albumTracks.trackNumber, 3))

    expect(row!.duration).toBeNull()
  })

  it("tidal columns default null and accept TIDAL metadata", async () => {
    await db.insert(albumTracks).values({
      albumId,
      trackNumber: 4,
      name: "Telephasic Workshop",
    })

    const [defaults] = await db
      .select({
        tidalTrackId: albumTracks.tidalTrackId,
        isrc: albumTracks.isrc,
        tidalLink: albumTracks.tidalLink,
      })
      .from(albumTracks)
      .where(eq(albumTracks.trackNumber, 4))

    expect(defaults!.tidalTrackId).toBeNull()
    expect(defaults!.isrc).toBeNull()
    expect(defaults!.tidalLink).toBeNull()

    await db
      .update(albumTracks)
      .set({
        tidalTrackId: "12345678",
        isrc: "GBAYE0000123",
        tidalLink: "https://tidal.com/track/12345678",
      })
      .where(eq(albumTracks.trackNumber, 4))

    const [row] = await db
      .select({
        tidalTrackId: albumTracks.tidalTrackId,
        isrc: albumTracks.isrc,
        tidalLink: albumTracks.tidalLink,
      })
      .from(albumTracks)
      .where(eq(albumTracks.trackNumber, 4))

    expect(row!.tidalTrackId).toBe("12345678")
    expect(row!.isrc).toBe("GBAYE0000123")
    expect(row!.tidalLink).toBe("https://tidal.com/track/12345678")
  })

  it("enforces composite PK (album_id, track_number)", async () => {
    await expect(
      db.insert(albumTracks).values({
        albumId,
        trackNumber: 1,
        name: "Duplicate track number",
      })
    ).rejects.toThrow()
  })
})
