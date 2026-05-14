import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.setConfig({ hookTimeout: 30_000 })

import type { Database } from "./index"
import { recordListen } from "./ingestion"
import { albums, albumTracks } from "./schema"
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

  it("enriched_at defaults to null", async () => {
    const [row] = await db
      .select({ enrichedAt: albums.enrichedAt })
      .from(albums)
      .where(eq(albums.id, albumId))

    expect(row!.enrichedAt).toBeNull()
  })

  it("can set image_url and enriched_at", async () => {
    const now = new Date()
    await db
      .update(albums)
      .set({ imageUrl: "https://example.com/art.jpg", enrichedAt: now })
      .where(eq(albums.id, albumId))

    const [row] = await db
      .select({ imageUrl: albums.imageUrl, enrichedAt: albums.enrichedAt })
      .from(albums)
      .where(eq(albums.id, albumId))

    expect(row!.imageUrl).toBe("https://example.com/art.jpg")
    expect(row!.enrichedAt).toEqual(now)

    // Reset for other tests
    await db
      .update(albums)
      .set({ imageUrl: null, enrichedAt: null })
      .where(eq(albums.id, albumId))
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

  it("allows null track_id for unscrobbled tracks", async () => {
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
