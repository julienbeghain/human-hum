import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.setConfig({ hookTimeout: 30_000 })

import type { Database } from "./index"
import type {
  AlbumInfoFetcher,
  AlbumInfoResult,
  TidalCatalogFetcher,
} from "./enrichment"
import {
  enrichAlbum,
  enrichAlbumWithTidal,
  LastfmAlbumInfoFetcher,
} from "./enrichment"
import { recordListen } from "./ingestion"
import { albums, albumTracks } from "./schema"
import type { TidalAlbum, TidalAlbumDetail } from "./tidal-api"
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
      .select({ imageUrl: albums.imageUrl, lastfmEnrichedAt: albums.lastfmEnrichedAt })
      .from(albums)
      .where(eq(albums.id, albumId))

    expect(album!.imageUrl).toBe(
      "https://lastfm.freetls.fastly.net/i/u/300x300/abc.png"
    )
    expect(album!.lastfmEnrichedAt).toBeInstanceOf(Date)

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

  it("matches track_id for tracks with hums", async () => {
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

  it("leaves track_id null for tracks without hums", async () => {
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

  it("does not set lastfm_enriched_at if fetcher throws", async () => {
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
      .select({ lastfmEnrichedAt: albums.lastfmEnrichedAt })
      .from(albums)
      .where(eq(albums.id, freshAlbumId))

    expect(album!.lastfmEnrichedAt).toBeNull()

    const trackRows = await freshDb
      .select()
      .from(albumTracks)
      .where(eq(albumTracks.albumId, freshAlbumId))

    expect(trackRows).toHaveLength(0)

    await freshClient.close()
  })

  it("leaves lastfm_enriched_at null and writes no tracks if the track insert fails", async () => {
    const { db: freshDb, client: freshClient } = await setupTestDb()

    const r = await recordListen(freshDb, {
      artist: { name: "Squarepusher" },
      track: { name: "Tommib" },
      album: { name: "Go Plastic" },
      listenedAt: new Date("2024-09-01T10:00:00Z"),
      source: "lastfm",
    })
    const freshAlbumId = r.albumId!

    // Two tracks share trackNumber 1 -> violates album_tracks PK
    // (album_id, track_number) on insert.
    const fetcher = fakeFetcher({
      imageUrl: "https://example.com/go-plastic.jpg",
      tracks: [
        { name: "My Red Hot Car", trackNumber: 1, duration: 295 },
        { name: "Boneville Occident", trackNumber: 1, duration: 222 },
      ],
    })

    await expect(
      enrichAlbum(freshDb, { albumId: freshAlbumId, fetcher })
    ).rejects.toThrow()

    const [album] = await freshDb
      .select({ lastfmEnrichedAt: albums.lastfmEnrichedAt })
      .from(albums)
      .where(eq(albums.id, freshAlbumId))

    expect(album!.lastfmEnrichedAt).toBeNull()

    const trackRows = await freshDb
      .select()
      .from(albumTracks)
      .where(eq(albumTracks.albumId, freshAlbumId))

    expect(trackRows).toHaveLength(0)

    await freshClient.close()
  })

  it("heals an album left with stale tracks and no lastfm_enriched_at marker on retry", async () => {
    const { db: freshDb, client: freshClient } = await setupTestDb()

    const r = await recordListen(freshDb, {
      artist: { name: "Plaid" },
      track: { name: "Eyen" },
      album: { name: "Double Figure" },
      listenedAt: new Date("2024-10-01T10:00:00Z"),
      source: "lastfm",
    })
    const freshAlbumId = r.albumId!

    // Simulate an interrupted prior enrichment: tracks were written but the
    // lastfm_enriched_at update never committed (separate neon-http
    // round-trip). The album page gate sees null lastfm_enriched_at and
    // retries.
    await freshDb.insert(albumTracks).values({
      albumId: freshAlbumId,
      trackNumber: 1,
      name: "Stale Row",
      trackId: null,
      duration: null,
    })

    const fetcher = fakeFetcher({
      imageUrl: "https://example.com/double-figure.jpg",
      tracks: [
        { name: "Eyen", trackNumber: 1, duration: 268 },
        { name: "Squance", trackNumber: 2, duration: 312 },
      ],
    })

    await enrichAlbum(freshDb, { albumId: freshAlbumId, fetcher })

    const [album] = await freshDb
      .select({ lastfmEnrichedAt: albums.lastfmEnrichedAt })
      .from(albums)
      .where(eq(albums.id, freshAlbumId))

    expect(album!.lastfmEnrichedAt).toBeInstanceOf(Date)

    const trackRows = await freshDb
      .select({ name: albumTracks.name, trackNumber: albumTracks.trackNumber })
      .from(albumTracks)
      .where(eq(albumTracks.albumId, freshAlbumId))

    expect(trackRows).toHaveLength(2)
    expect(trackRows.map((t) => t.name).sort()).toEqual(["Eyen", "Squance"])

    await freshClient.close()
  })

  it("sets lastfm_enriched_at but leaves image_url null when no artwork", async () => {
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
      .select({ imageUrl: albums.imageUrl, lastfmEnrichedAt: albums.lastfmEnrichedAt })
      .from(albums)
      .where(eq(albums.id, freshAlbumId))

    expect(album!.imageUrl).toBeNull()
    expect(album!.lastfmEnrichedAt).toBeInstanceOf(Date)

    const trackRows = await freshDb
      .select()
      .from(albumTracks)
      .where(eq(albumTracks.albumId, freshAlbumId))

    expect(trackRows).toHaveLength(2)

    await freshClient.close()
  })

  it("parses album.getInfo with numeric duration and rank from the real schema", async () => {
    // Regression: the album.getInfo endpoint returns duration
    // and @attr.rank as JSON numbers, not strings. This drives the real Zod
    // schema via a mocked fetch — the fakeFetcher in other tests bypasses it,
    // which is why the global enrichment failure went undetected.
    const payload = {
      album: {
        image: [
          { "#text": "https://lastfm.example/34s/a.png" },
          { "#text": "https://lastfm.example/300x300/a.png" },
        ],
        tracks: {
          track: [
            { name: "Wildlife Analysis", duration: 373, "@attr": { rank: 1 } },
            { name: "Roygbiv", duration: 172, "@attr": { rank: 2 } },
          ],
        },
      },
    }

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )

    try {
      const fetcher = new LastfmAlbumInfoFetcher("test-key")
      const result = await fetcher.getAlbumInfo({
        albumName: "Music Has the Right to Children",
        artistName: "Boards of Canada",
      })

      expect(result.imageUrl).toBe("https://lastfm.example/300x300/a.png")
      expect(result.tracks).toEqual([
        { name: "Wildlife Analysis", trackNumber: 1, duration: 373 },
        { name: "Roygbiv", trackNumber: 2, duration: 172 },
      ])
    } finally {
      fetchSpy.mockRestore()
    }
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
      .select({ imageUrl: albums.imageUrl, lastfmEnrichedAt: albums.lastfmEnrichedAt })
      .from(albums)
      .where(eq(albums.id, freshAlbumId))

    expect(album!.imageUrl).toBe("https://example.com/eno.jpg")
    expect(album!.lastfmEnrichedAt).toBeInstanceOf(Date)

    const trackRows = await freshDb
      .select()
      .from(albumTracks)
      .where(eq(albumTracks.albumId, freshAlbumId))

    expect(trackRows).toHaveLength(0)

    await freshClient.close()
  })
})

const LASTFM_PLACEHOLDER =
  "https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png"

// A LastFM-enriched album in a chosen artwork state, the starting point every
// TIDAL artwork test shares. Returns the album id.
async function seedLastfmEnrichedAlbum(
  db: Database,
  opts: {
    artist: string
    track: string
    album: string
    imageUrl: string | null
    lastfmEnrichedAt?: Date | null
  }
): Promise<number> {
  const r = await recordListen(db, {
    artist: { name: opts.artist },
    track: { name: opts.track },
    album: { name: opts.album },
    listenedAt: new Date("2024-11-01T10:00:00Z"),
    source: "lastfm",
  })
  const albumId = r.albumId!

  await db
    .update(albums)
    .set({
      imageUrl: opts.imageUrl,
      lastfmEnrichedAt:
        opts.lastfmEnrichedAt === undefined ? new Date() : opts.lastfmEnrichedAt,
    })
    .where(eq(albums.id, albumId))

  return albumId
}

// Records what the orchestrator asked the catalog so tests can assert no call
// happened on gated paths.
function fakeTidalFetcher(opts: {
  candidates?: TidalAlbum[]
  detail?: TidalAlbumDetail
  searchError?: Error
}): TidalCatalogFetcher & { searchCalls: number; getAlbumCalls: number } {
  const fetcher = {
    searchCalls: 0,
    getAlbumCalls: 0,
    async searchAlbums(): Promise<TidalAlbum[]> {
      fetcher.searchCalls++
      if (opts.searchError) throw opts.searchError
      return opts.candidates ?? []
    },
    async getAlbum(): Promise<TidalAlbumDetail> {
      fetcher.getAlbumCalls++
      return opts.detail ?? { artistName: null, coverArtUrl: null }
    },
  }
  return fetcher
}

async function readAlbum(db: Database, albumId: number) {
  const [album] = await db
    .select({
      imageUrl: albums.imageUrl,
      tidalEnrichedAt: albums.tidalEnrichedAt,
    })
    .from(albums)
    .where(eq(albums.id, albumId))
  return album!
}

describe("enrichAlbumWithTidal", () => {
  it("fills missing artwork from TIDAL when the album and artist match", async () => {
    const { db, client } = await setupTestDb()
    const albumId = await seedLastfmEnrichedAlbum(db, {
      artist: "Autechre",
      track: "Clipper",
      album: "Tri Repetae",
      imageUrl: null,
    })

    const fetcher = fakeTidalFetcher({
      candidates: [{ id: "t1", title: "Tri Repetae", popularity: 0.5 }],
      detail: { artistName: "Autechre", coverArtUrl: "https://tidal/cover.jpg" },
    })

    await enrichAlbumWithTidal(db, { albumId, fetcher })

    const album = await readAlbum(db, albumId)
    expect(album.imageUrl).toBe("https://tidal/cover.jpg")
    expect(album.tidalEnrichedAt).toBeInstanceOf(Date)

    await client.close()
  })

  it("treats the LastFM star placeholder as missing and replaces it", async () => {
    const { db, client } = await setupTestDb()
    const albumId = await seedLastfmEnrichedAlbum(db, {
      artist: "Boards of Canada",
      track: "Olson",
      album: "Geogaddi",
      imageUrl: LASTFM_PLACEHOLDER,
    })

    const fetcher = fakeTidalFetcher({
      candidates: [{ id: "t1", title: "Geogaddi", popularity: 0.9 }],
      detail: {
        artistName: "Boards of Canada",
        coverArtUrl: "https://tidal/geogaddi.jpg",
      },
    })

    await enrichAlbumWithTidal(db, { albumId, fetcher })

    expect((await readAlbum(db, albumId)).imageUrl).toBe(
      "https://tidal/geogaddi.jpg"
    )

    await client.close()
  })

  it("never overwrites genuine LastFM artwork and skips the catalog", async () => {
    const { db, client } = await setupTestDb()
    const albumId = await seedLastfmEnrichedAlbum(db, {
      artist: "Aphex Twin",
      track: "Xtal",
      album: "Selected Ambient Works 85-92",
      imageUrl: "https://lastfm.example/real-cover.png",
    })

    const fetcher = fakeTidalFetcher({})

    await enrichAlbumWithTidal(db, { albumId, fetcher })

    const album = await readAlbum(db, albumId)
    expect(album.imageUrl).toBe("https://lastfm.example/real-cover.png")
    expect(album.tidalEnrichedAt).toBeInstanceOf(Date)
    expect(fetcher.searchCalls).toBe(0)

    await client.close()
  })

  it("marks done without artwork when the album is not on TIDAL", async () => {
    const { db, client } = await setupTestDb()
    const albumId = await seedLastfmEnrichedAlbum(db, {
      artist: "Some Obscure Act",
      track: "Track",
      album: "Unfindable",
      imageUrl: null,
    })

    const fetcher = fakeTidalFetcher({ candidates: [] })

    await enrichAlbumWithTidal(db, { albumId, fetcher })

    const album = await readAlbum(db, albumId)
    expect(album.imageUrl).toBeNull()
    expect(album.tidalEnrichedAt).toBeInstanceOf(Date)
    expect(fetcher.getAlbumCalls).toBe(0)

    await client.close()
  })

  it("treats a title match with a different artist as no-match", async () => {
    const { db, client } = await setupTestDb()
    const albumId = await seedLastfmEnrichedAlbum(db, {
      artist: "Autechre",
      track: "Clipper",
      album: "Tri Repetae",
      imageUrl: null,
    })

    // Title matches but the catalog album belongs to a different artist.
    const fetcher = fakeTidalFetcher({
      candidates: [{ id: "t1", title: "Tri Repetae", popularity: 0.7 }],
      detail: { artistName: "Daniel Avery", coverArtUrl: "https://tidal/wrong.jpg" },
    })

    await enrichAlbumWithTidal(db, { albumId, fetcher })

    const album = await readAlbum(db, albumId)
    expect(album.imageUrl).toBeNull()
    expect(album.tidalEnrichedAt).toBeInstanceOf(Date)

    await client.close()
  })

  it("leaves artwork untouched when the matched TIDAL album has no cover", async () => {
    const { db, client } = await setupTestDb()
    const albumId = await seedLastfmEnrichedAlbum(db, {
      artist: "Plaid",
      track: "Eyen",
      album: "Double Figure",
      imageUrl: null,
    })

    const fetcher = fakeTidalFetcher({
      candidates: [{ id: "t1", title: "Double Figure", popularity: 0.4 }],
      detail: { artistName: "Plaid", coverArtUrl: null },
    })

    await enrichAlbumWithTidal(db, { albumId, fetcher })

    const album = await readAlbum(db, albumId)
    expect(album.imageUrl).toBeNull()
    expect(album.tidalEnrichedAt).toBeInstanceOf(Date)

    await client.close()
  })

  it("leaves tidal_enriched_at null when the catalog call fails", async () => {
    const { db, client } = await setupTestDb()
    const albumId = await seedLastfmEnrichedAlbum(db, {
      artist: "Squarepusher",
      track: "Tommib",
      album: "Go Plastic",
      imageUrl: null,
    })

    const fetcher = fakeTidalFetcher({
      searchError: new Error("TIDAL API error: 429 Too Many Requests"),
    })

    await expect(
      enrichAlbumWithTidal(db, { albumId, fetcher })
    ).rejects.toThrow("429")

    expect((await readAlbum(db, albumId)).tidalEnrichedAt).toBeNull()

    await client.close()
  })

  it("defers without a catalog call when LastFM has not enriched yet", async () => {
    const { db, client } = await setupTestDb()
    const albumId = await seedLastfmEnrichedAlbum(db, {
      artist: "Burial",
      track: "Archangel",
      album: "Untrue",
      imageUrl: null,
      lastfmEnrichedAt: null,
    })

    const fetcher = fakeTidalFetcher({})

    await enrichAlbumWithTidal(db, { albumId, fetcher })

    expect((await readAlbum(db, albumId)).tidalEnrichedAt).toBeNull()
    expect(fetcher.searchCalls).toBe(0)

    await client.close()
  })

  it("returns early without a catalog call when already TIDAL-enriched", async () => {
    const { db, client } = await setupTestDb()
    const albumId = await seedLastfmEnrichedAlbum(db, {
      artist: "Four Tet",
      track: "Angel Echoes",
      album: "There Is Love in You",
      imageUrl: null,
    })
    await db
      .update(albums)
      .set({ tidalEnrichedAt: new Date() })
      .where(eq(albums.id, albumId))

    const fetcher = fakeTidalFetcher({})

    await enrichAlbumWithTidal(db, { albumId, fetcher })

    expect(fetcher.searchCalls).toBe(0)

    await client.close()
  })
})
