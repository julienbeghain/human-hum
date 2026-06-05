import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.setConfig({ hookTimeout: 30_000 })

import type { Database } from "./index"
import type { AlbumInfoFetcher, AlbumInfoResult } from "./enrichment"
import { enrichAlbum } from "./enrichment"
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

  await recordListen(db, {
    artist: { name: "Boards of Canada" },
    track: { name: "Aquarius" },
    album: { name: "Music Has the Right to Children" },
    listenedAt: new Date("2024-05-01T10:05:00Z"),
    source: "lastfm",
  })
})

afterAll(async () => {
  await client.close()
})

function fakeFetcher(result: AlbumInfoResult): AlbumInfoFetcher {
  return {
    getAlbumInfo: async () => result,
  }
}

function failingFetcher(error: Error): AlbumInfoFetcher {
  return {
    getAlbumInfo: async () => {
      throw error
    },
  }
}

describe("enrichAlbum", () => {
  it("writes artwork and tracks on successful enrichment", async () => {
    const fetcher = fakeFetcher({
      imageUrl: "https://lastfm.freetls.fastly.net/i/u/300x300/abc.png",
      tracks: [
        { name: "Wildlife Analysis", trackNumber: 1, duration: 373 },
        { name: "An Eagle in Your Mind", trackNumber: 2, duration: 393 },
        { name: "Roygbiv", trackNumber: 3, duration: 172 },
      ],
    })

    await enrichAlbum(db, { albumId, fetcher })

    const [album] = await db
      .select({ imageUrl: albums.imageUrl, enrichedAt: albums.enrichedAt })
      .from(albums)
      .where(eq(albums.id, albumId))

    expect(album!.imageUrl).toBe(
      "https://lastfm.freetls.fastly.net/i/u/300x300/abc.png"
    )
    expect(album!.enrichedAt).toBeInstanceOf(Date)

    const rows = await db
      .select()
      .from(albumTracks)
      .where(eq(albumTracks.albumId, albumId))

    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      trackNumber: 1,
      name: "Wildlife Analysis",
      duration: 373,
    })
    expect(rows[2]).toMatchObject({
      trackNumber: 3,
      name: "Roygbiv",
      duration: 172,
    })
  })

  it("returns early without API call if already enriched", async () => {
    let callCount = 0
    const fetcher: AlbumInfoFetcher = {
      getAlbumInfo: async () => {
        callCount++
        return { imageUrl: "https://example.com/new.png", tracks: [] }
      },
    }

    await enrichAlbum(db, { albumId, fetcher })

    expect(callCount).toBe(0)
  })

  it("matches track_id for scrobbled tracks", async () => {
    const rows = await db
      .select({
        name: albumTracks.name,
        trackId: albumTracks.trackId,
      })
      .from(albumTracks)
      .where(eq(albumTracks.albumId, albumId))

    const roygbiv = rows.find((r) => r.name === "Roygbiv")
    expect(roygbiv!.trackId).toBe(trackId)
  })

  it("leaves track_id null for unscrobbled tracks", async () => {
    const rows = await db
      .select({
        name: albumTracks.name,
        trackId: albumTracks.trackId,
      })
      .from(albumTracks)
      .where(eq(albumTracks.albumId, albumId))

    const wildlife = rows.find((r) => r.name === "Wildlife Analysis")
    expect(wildlife!.trackId).toBeNull()
  })

  it("does not set enriched_at if fetcher throws", async () => {
    const { db: freshDb, client: freshClient } = await setupTestDb()

    const r = await recordListen(freshDb, {
      artist: { name: "Autechre" },
      track: { name: "Gantz Graf" },
      album: { name: "Gantz Graf EP" },
      listenedAt: new Date("2024-06-01T10:00:00Z"),
      source: "lastfm",
    })
    const freshAlbumId = r.albumId!

    const fetcher = failingFetcher(new Error("LastFM API: 503 Service Unavailable"))

    await expect(
      enrichAlbum(freshDb, { albumId: freshAlbumId, fetcher })
    ).rejects.toThrow("503 Service Unavailable")

    const [album] = await freshDb
      .select({ enrichedAt: albums.enrichedAt })
      .from(albums)
      .where(eq(albums.id, freshAlbumId))

    expect(album!.enrichedAt).toBeNull()

    const trackRows = await freshDb
      .select()
      .from(albumTracks)
      .where(eq(albumTracks.albumId, freshAlbumId))

    expect(trackRows).toHaveLength(0)

    await freshClient.close()
  })

  it("sets enriched_at but leaves image_url null when no artwork", async () => {
    const { db: freshDb, client: freshClient } = await setupTestDb()

    const r = await recordListen(freshDb, {
      artist: { name: "Aphex Twin" },
      track: { name: "Xtal" },
      album: { name: "Selected Ambient Works" },
      listenedAt: new Date("2024-07-01T10:00:00Z"),
      source: "lastfm",
    })
    const freshAlbumId = r.albumId!

    const fetcher = fakeFetcher({
      imageUrl: null,
      tracks: [
        { name: "Xtal", trackNumber: 1, duration: 290 },
        { name: "Tha", trackNumber: 2, duration: 540 },
      ],
    })

    await enrichAlbum(freshDb, { albumId: freshAlbumId, fetcher })

    const [album] = await freshDb
      .select({ imageUrl: albums.imageUrl, enrichedAt: albums.enrichedAt })
      .from(albums)
      .where(eq(albums.id, freshAlbumId))

    expect(album!.imageUrl).toBeNull()
    expect(album!.enrichedAt).toBeInstanceOf(Date)

    const trackRows = await freshDb
      .select()
      .from(albumTracks)
      .where(eq(albumTracks.albumId, freshAlbumId))

    expect(trackRows).toHaveLength(2)

    await freshClient.close()
  })

  it("handles album with no tracks in response", async () => {
    const { db: freshDb, client: freshClient } = await setupTestDb()

    const r = await recordListen(freshDb, {
      artist: { name: "Brian Eno" },
      track: { name: "Music for Airports" },
      album: { name: "Ambient 1" },
      listenedAt: new Date("2024-08-01T10:00:00Z"),
      source: "lastfm",
    })
    const freshAlbumId = r.albumId!

    const fetcher = fakeFetcher({
      imageUrl: "https://example.com/eno.jpg",
      tracks: [],
    })

    await enrichAlbum(freshDb, { albumId: freshAlbumId, fetcher })

    const [album] = await freshDb
      .select({ imageUrl: albums.imageUrl, enrichedAt: albums.enrichedAt })
      .from(albums)
      .where(eq(albums.id, freshAlbumId))

    expect(album!.imageUrl).toBe("https://example.com/eno.jpg")
    expect(album!.enrichedAt).toBeInstanceOf(Date)

    const trackRows = await freshDb
      .select()
      .from(albumTracks)
      .where(eq(albumTracks.albumId, freshAlbumId))

    expect(trackRows).toHaveLength(0)

    await freshClient.close()
  })
})
