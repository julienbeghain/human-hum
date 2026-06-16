import type { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.setConfig({ hookTimeout: 30_000 })

import type { Database } from "./index"
import { enrichAlbum } from "./enrichment"
import { recordListen } from "./ingestion"
import {
  getAlbumDetail,
  getArtistDetail,
  getArtistRankings,
  getListeningClock,
  getHumById,
  getHums,
  getStats,
  getTimeSeries,
} from "./queries"
import { setupTestDb } from "./test-utils"

let client: PGlite
let db: Database

// Known IDs populated during seed — avoids chaining queries to discover them
let boardsOfCanadaId: number
let mhtrtcAlbumId: number

// Hum IDs for detail tests
let windowlickerHumId: number
let roygbivHumId: number

beforeAll(async () => {
  ;({ db, client } = await setupTestDb())

  // Seed data — capture entity IDs for direct use in tests
  //
  // Timeline:
  //   2020-01-01T00:00 Autechre  - Clipper                          (spotify, hour 0)
  //   2024-05-01T10:00 BoC       - Roygbiv  [MHTRTC]               (lastfm,  hour 10)
  //   2024-05-01T11:00 BoC       - Aquarius [MHTRTC]               (lastfm,  hour 11)
  //   2025-12-31T23:59 Autechre  - Bike                            (spotify, hour 23)
  //   2026-01-15T20:00 Aphex Twin - Windowlicker                   (lastfm,  hour 20)
  //   2026-03-01T12:00 Aphex Twin - Vordhosbn [Drukqs]             (lastfm,  hour 12)

  const r1 = await recordListen(db, {
    artist: { name: "Aphex Twin" },
    track: { name: "Windowlicker" },
    listenedAt: new Date("2026-01-15T20:00:00Z"),
    source: "lastfm",
  })
  windowlickerHumId = r1.humId

  await recordListen(db, {
    artist: { name: "Aphex Twin" },
    track: { name: "Vordhosbn" },
    album: { name: "Drukqs" },
    listenedAt: new Date("2026-03-01T12:00:00Z"),
    source: "lastfm",
  })

  const r3 = await recordListen(db, {
    artist: { name: "Boards of Canada" },
    track: { name: "Roygbiv" },
    album: { name: "Music Has the Right to Children" },
    listenedAt: new Date("2024-05-01T10:00:00Z"),
    source: "lastfm",
  })
  boardsOfCanadaId = r3.artistId
  mhtrtcAlbumId = r3.albumId!
  roygbivHumId = r3.humId

  await recordListen(db, {
    artist: { name: "Boards of Canada" },
    track: { name: "Aquarius" },
    album: { name: "Music Has the Right to Children" },
    listenedAt: new Date("2024-05-01T11:00:00Z"),
    source: "lastfm",
  })

  await recordListen(db, {
    artist: { name: "Autechre" },
    track: { name: "Clipper" },
    listenedAt: new Date("2020-01-01T00:00:00Z"),
    source: "spotify",
  })

  await recordListen(db, {
    artist: { name: "Autechre" },
    track: { name: "Bike" },
    listenedAt: new Date("2025-12-31T23:59:00Z"),
    source: "spotify",
  })
})

afterAll(async () => {
  await client.close()
})

// --- getHums ---

describe("getHums", () => {
  it("returns hums with track and artist names", async () => {
    const { rows } = await getHums(db)
    expect(rows.length).toBe(6)

    const row = rows.find((r) => r.trackName === "Roygbiv")
    expect(row).toBeDefined()
    expect(row!.artistName).toBe("Boards of Canada")
    expect(row!.albumName).toBe("Music Has the Right to Children")
    expect(row!.source).toBe("lastfm")
    expect(row!.listenedAt).toBeInstanceOf(Date)
  })

  it("returns null albumName when hum has no album", async () => {
    const { rows } = await getHums(db)
    const row = rows.find((r) => r.trackName === "Windowlicker")
    expect(row).toBeDefined()
    expect(row!.albumName).toBeNull()
  })

  it("orders by listenedAt descending by default", async () => {
    const { rows } = await getHums(db)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.listenedAt.getTime()).toBeGreaterThanOrEqual(
        rows[i]!.listenedAt.getTime()
      )
    }
  })

  it("orders ascending when orderAsc is true", async () => {
    const { rows } = await getHums(db, { orderAsc: true })
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.listenedAt.getTime()).toBeLessThanOrEqual(
        rows[i]!.listenedAt.getTime()
      )
    }
  })

  it("supports cursor-based pagination", async () => {
    const first = await getHums(db, { pageSize: 2 })
    expect(first.rows.length).toBe(2)

    const next = await getHums(db, {
      pageSize: 2,
      cursor: first.rows[1]!.listenedAt,
    })
    expect(next.rows.length).toBeGreaterThan(0)
    for (const row of next.rows) {
      expect(row.listenedAt.getTime()).toBeLessThan(
        first.rows[1]!.listenedAt.getTime()
      )
    }
  })

  it("filters by time range (from and to)", async () => {
    const from = new Date("2025-01-01T00:00:00Z")
    const to = new Date("2026-01-31T23:59:59Z")
    const { rows } = await getHums(db, { from, to })

    expect(rows.length).toBe(2) // Autechre Bike + Aphex Twin Windowlicker
    for (const row of rows) {
      expect(row.listenedAt.getTime()).toBeGreaterThanOrEqual(from.getTime())
      expect(row.listenedAt.getTime()).toBeLessThanOrEqual(to.getTime())
    }
  })

  it("filters by source", async () => {
    const { rows } = await getHums(db, { source: "spotify" })
    expect(rows.length).toBe(2)
    for (const row of rows) {
      expect(row.source).toBe("spotify")
    }
  })

  // --- Offset pagination ---

  it("returns totalCount alongside rows", async () => {
    const result = await getHums(db)
    expect(result.totalCount).toBe(6)
    expect(result.rows.length).toBe(6)
  })

  it("paginates with page and pageSize", async () => {
    const page1 = await getHums(db, { page: 1, pageSize: 2 })
    expect(page1.rows.length).toBe(2)
    expect(page1.totalCount).toBe(6)

    const page2 = await getHums(db, { page: 2, pageSize: 2 })
    expect(page2.rows.length).toBe(2)
    expect(page2.totalCount).toBe(6)

    // Pages should have different rows
    const page1Ids = page1.rows.map((r) => r.id)
    const page2Ids = page2.rows.map((r) => r.id)
    expect(page1Ids).not.toEqual(page2Ids)
  })

  it("returns empty rows for page beyond data", async () => {
    const result = await getHums(db, { page: 100, pageSize: 50 })
    expect(result.rows.length).toBe(0)
    expect(result.totalCount).toBe(6)
  })

  it("totalCount respects filters", async () => {
    const result = await getHums(db, {
      source: "spotify",
      page: 1,
      pageSize: 10,
    })
    expect(result.totalCount).toBe(2)
    expect(result.rows.length).toBe(2)
  })
})

// --- getHumById ---

describe("getHumById", () => {
  it("returns hum with track/artist info and play counts", async () => {
    const detail = await getHumById(db, roygbivHumId)
    expect(detail).not.toBeNull()
    expect(detail!.trackName).toBe("Roygbiv")
    expect(detail!.artistName).toBe("Boards of Canada")
    expect(detail!.albumName).toBe("Music Has the Right to Children")
    expect(detail!.albumId).toBe(mhtrtcAlbumId)
    expect(detail!.artistId).toBe(boardsOfCanadaId)
    // BoC has 2 hums total (Roygbiv + Aquarius)
    expect(detail!.artistHumCount).toBe(2)
    // Roygbiv has one hum
    expect(detail!.trackHumCount).toBe(1)
  })

  it("returns null albumName when hum has no album", async () => {
    const detail = await getHumById(db, windowlickerHumId)
    expect(detail).not.toBeNull()
    expect(detail!.trackName).toBe("Windowlicker")
    expect(detail!.albumId).toBeNull()
    expect(detail!.albumName).toBeNull()
  })

  it("returns null for non-existent hum", async () => {
    const detail = await getHumById(db, 99999)
    expect(detail).toBeNull()
  })
})

// --- getStats ---

describe("getStats", () => {
  it("returns aggregate statistics", async () => {
    const stats = await getStats(db)
    expect(stats.total).toBe(6)
    expect(stats.earliest).toBeInstanceOf(Date)
    expect(stats.latest).toBeInstanceOf(Date)
    expect(stats.earliest!.getTime()).toBe(
      new Date("2020-01-01T00:00:00Z").getTime()
    )
    expect(stats.latest!.getTime()).toBe(
      new Date("2026-03-01T12:00:00Z").getTime()
    )
    expect(stats.uniqueArtists).toBe(3)
    expect(stats.uniqueTracks).toBe(6)
    expect(stats.uniqueAlbums).toBe(2) // Drukqs + MHTRTC
  })

  it("filters stats by time range", async () => {
    const stats = await getStats(db, {
      from: new Date("2026-01-01T00:00:00Z"),
    })
    expect(stats.total).toBe(2)
    expect(stats.uniqueArtists).toBe(1)
  })
})

// --- getArtistRankings ---

describe("getArtistRankings", () => {
  it("ranks artists by play count descending", async () => {
    const rankings = await getArtistRankings(db)
    expect(rankings.length).toBe(3)
    // All artists have 2 plays — verify ordering is stable (descending)
    for (let i = 1; i < rankings.length; i++) {
      expect(rankings[i - 1]!.humCount).toBeGreaterThanOrEqual(
        rankings[i]!.humCount
      )
    }
    expect(rankings[0]!.artistName).toBeTruthy()
    expect(rankings[0]!.artistId).toBeGreaterThan(0)
  })

  it("respects topN", async () => {
    const rankings = await getArtistRankings(db, { topN: 1 })
    expect(rankings.length).toBe(1)
  })

  it("filters by time range", async () => {
    const rankings = await getArtistRankings(db, {
      from: new Date("2026-01-01T00:00:00Z"),
    })
    expect(rankings.length).toBe(1)
    expect(rankings[0]!.artistName).toBe("Aphex Twin")
  })
})

// --- getArtistDetail ---

describe("getArtistDetail", () => {
  it("returns artist info with top tracks and albums", async () => {
    const detail = await getArtistDetail(db, { artistId: boardsOfCanadaId })
    expect(detail).not.toBeNull()
    expect(detail!.artistName).toBe("Boards of Canada")
    expect(detail!.humCount).toBe(2)
    expect(detail!.topTracks.length).toBe(2)
    expect(detail!.topAlbums.length).toBe(1)
    expect(detail!.topAlbums[0]!.albumName).toBe(
      "Music Has the Right to Children"
    )
  })

  it("returns null for non-existent artist", async () => {
    const detail = await getArtistDetail(db, { artistId: 99999 })
    expect(detail).toBeNull()
  })
})

// --- getArtistDetail (top-tracks cap) ---

describe("getArtistDetail (top-tracks cap)", () => {
  let capDb: Database
  let capClient: PGlite
  let prolificArtistId: number

  beforeAll(async () => {
    ;({ db: capDb, client: capClient } = await setupTestDb())

    // One artist with 12 distinct tracks, descending play counts (track 1 = 12
    // plays … track 12 = 1 play) so the cap and ordering are both observable.
    for (let track = 1; track <= 12; track++) {
      for (let play = 0; play <= 12 - track; play++) {
        const r = await recordListen(capDb, {
          artist: { name: "Prolific Artist" },
          track: { name: `Track ${track}` },
          listenedAt: new Date(Date.UTC(2026, 0, track, 0, play)),
          source: "lastfm",
        })
        prolificArtistId = r.artistId
      }
    }
  })

  afterAll(async () => {
    await capClient.close()
  })

  it("caps top tracks at 10 and orders by play count descending", async () => {
    const detail = await getArtistDetail(capDb, { artistId: prolificArtistId })
    expect(detail).not.toBeNull()
    expect(detail!.topTracks.length).toBe(10)
    for (let i = 1; i < detail!.topTracks.length; i++) {
      expect(detail!.topTracks[i - 1]!.humCount).toBeGreaterThanOrEqual(
        detail!.topTracks[i]!.humCount
      )
    }
    // Most-played track surfaces first; the two least-played are dropped.
    expect(detail!.topTracks[0]!.trackName).toBe("Track 1")
    const names = detail!.topTracks.map((t) => t.trackName)
    expect(names).not.toContain("Track 12")
  })
})

// --- getAlbumDetail ---

describe("getAlbumDetail", () => {
  it("returns album info with track listing", async () => {
    const album = await getAlbumDetail(db, { albumId: mhtrtcAlbumId })
    expect(album).not.toBeNull()
    expect(album!.albumName).toBe("Music Has the Right to Children")
    expect(album!.artistName).toBe("Boards of Canada")
    expect(album!.humCount).toBe(2)
    expect(album!.tracks.length).toBe(2)
  })

  it("returns tracks in play-count order with null enrichment fields when un-enriched", async () => {
    const album = await getAlbumDetail(db, { albumId: mhtrtcAlbumId })
    expect(album!.lastfmEnrichedAt).toBeNull()
    expect(album!.imageUrl).toBeNull()
    expect(album!.tracks[0]!.trackNumber).toBeNull()
    expect(album!.tracks[0]!.duration).toBeNull()
    expect(album!.tracks[0]!.humCount).toBeGreaterThanOrEqual(album!.tracks[1]!.humCount)
  })

  it("returns null for non-existent album", async () => {
    const album = await getAlbumDetail(db, { albumId: 99999 })
    expect(album).toBeNull()
  })
})

// --- getTimeSeries ---

describe("getTimeSeries", () => {
  it("buckets hums by month", async () => {
    const series = await getTimeSeries(db, { period: "month" })
    expect(series.length).toBeGreaterThan(0)
    for (const bucket of series) {
      expect(bucket.period).toBeInstanceOf(Date)
      expect(bucket.count).toBeGreaterThan(0)
    }
  })

  it("buckets hums by year", async () => {
    const series = await getTimeSeries(db, { period: "year" })
    // 2020, 2024, 2025, 2026
    expect(series.length).toBe(4)
    const totalCount = series.reduce((sum, b) => sum + b.count, 0)
    expect(totalCount).toBe(6)
  })

  it("respects time-range filter", async () => {
    const series = await getTimeSeries(db, {
      period: "month",
      from: new Date("2026-01-01T00:00:00Z"),
    })
    for (const bucket of series) {
      expect(bucket.period.getFullYear()).toBe(2026)
    }
  })
})

// --- getListeningClock ---

describe("getListeningClock", () => {
  it("returns 24 slots", async () => {
    const clock = await getListeningClock(db)
    expect(clock.length).toBe(24)
    expect(clock[0]!.hour).toBe(0)
    expect(clock[23]!.hour).toBe(23)
  })

  it("counts hums per hour", async () => {
    const clock = await getListeningClock(db)
    const totalCount = clock.reduce((sum, s) => sum + s.count, 0)
    expect(totalCount).toBe(6)
  })

  it("populates exactly the hours with hums", async () => {
    // Seed hours: 0 (Clipper), 10 (Roygbiv), 11 (Aquarius), 12 (Vordhosbn), 20 (Windowlicker), 23 (Bike)
    const clock = await getListeningClock(db)
    const populated = clock.filter((s) => s.count > 0)
    expect(populated.length).toBe(6)

    const populatedHours = populated.map((s) => s.hour).sort((a, b) => a - b)
    expect(populatedHours).toEqual([0, 10, 11, 12, 20, 23])

    const zeroHours = clock.filter((s) => s.count === 0)
    expect(zeroHours.length).toBe(18)
  })
})

// --- getAlbumDetail (enriched) ---

describe("getAlbumDetail (enriched album)", () => {
  let enrichedDb: Database
  let enrichedClient: PGlite
  let enrichedAlbumId: number

  beforeAll(async () => {
    ;({ db: enrichedDb, client: enrichedClient } = await setupTestDb())

    const r1 = await recordListen(enrichedDb, {
      artist: { name: "Boards of Canada" },
      track: { name: "Roygbiv" },
      album: { name: "Music Has the Right to Children" },
      listenedAt: new Date("2024-05-01T10:00:00Z"),
      source: "lastfm",
    })
    enrichedAlbumId = r1.albumId!

    await recordListen(enrichedDb, {
      artist: { name: "Boards of Canada" },
      track: { name: "Aquarius" },
      album: { name: "Music Has the Right to Children" },
      listenedAt: new Date("2024-05-01T11:00:00Z"),
      source: "lastfm",
    })

    await enrichAlbum(enrichedDb, {
      albumId: enrichedAlbumId,
      fetcher: {
        getAlbumInfo: async () => ({
          imageUrl: "https://lastfm.freetls.fastly.net/i/u/300x300/abc.png",
          tracks: [
            { name: "Wildlife Analysis", trackNumber: 1, duration: 373 },
            { name: "An Eagle in Your Mind", trackNumber: 2, duration: 393 },
            { name: "Roygbiv", trackNumber: 3, duration: 172 },
            { name: "Aquarius", trackNumber: 4, duration: 356 },
          ],
        }),
      },
    })
  })

  afterAll(async () => {
    await enrichedClient.close()
  })

  it("returns tracks in track-number order", async () => {
    const album = await getAlbumDetail(enrichedDb, { albumId: enrichedAlbumId })
    expect(album).not.toBeNull()
    expect(album!.lastfmEnrichedAt).toBeInstanceOf(Date)
    expect(album!.imageUrl).toBe("https://lastfm.freetls.fastly.net/i/u/300x300/abc.png")

    const trackNumbers = album!.tracks.map((t) => t.trackNumber)
    expect(trackNumbers).toEqual([1, 2, 3, 4])

    const trackNames = album!.tracks.map((t) => t.trackName)
    expect(trackNames).toEqual([
      "Wildlife Analysis",
      "An Eagle in Your Mind",
      "Roygbiv",
      "Aquarius",
    ])
  })

  it("shows 0 plays for tracks with no hums and live counts for tracks with hums", async () => {
    const album = await getAlbumDetail(enrichedDb, { albumId: enrichedAlbumId })
    const tracks = album!.tracks

    const wildlife = tracks.find((t) => t.trackName === "Wildlife Analysis")!
    expect(wildlife.humCount).toBe(0)
    expect(wildlife.trackId).toBeNull()

    const eagle = tracks.find((t) => t.trackName === "An Eagle in Your Mind")!
    expect(eagle.humCount).toBe(0)
    expect(eagle.trackId).toBeNull()

    const roygbiv = tracks.find((t) => t.trackName === "Roygbiv")!
    expect(roygbiv.humCount).toBe(1)
    expect(roygbiv.trackId).not.toBeNull()

    const aquarius = tracks.find((t) => t.trackName === "Aquarius")!
    expect(aquarius.humCount).toBe(1)
    expect(aquarius.trackId).not.toBeNull()
  })

  it("reflects new hums without re-enrichment", async () => {
    await recordListen(enrichedDb, {
      artist: { name: "Boards of Canada" },
      track: { name: "Roygbiv" },
      album: { name: "Music Has the Right to Children" },
      listenedAt: new Date("2024-05-02T10:00:00Z"),
      source: "lastfm",
    })

    const album = await getAlbumDetail(enrichedDb, { albumId: enrichedAlbumId })
    const roygbiv = album!.tracks.find((t) => t.trackName === "Roygbiv")!
    expect(roygbiv.humCount).toBe(2)
    expect(album!.humCount).toBe(3)
  })
})

// --- getAlbumDetail (enriched with no tracklist) ---

describe("getAlbumDetail (enriched, empty tracklist)", () => {
  it("falls back to hum-derived tracks when enrichment produced no tracklist", async () => {
    const { db: emptyDb, client: emptyClient } = await setupTestDb()

    const r = await recordListen(emptyDb, {
      artist: { name: "noxz" },
      track: { name: "Dreaming Wide Awake" },
      album: { name: "Dreaming Wide Awake" },
      listenedAt: new Date("2024-05-01T10:00:00Z"),
      source: "lastfm",
    })
    const emptyAlbumId = r.albumId!

    // LastFM enriched the album but album.getInfo carried no tracklist.
    await enrichAlbum(emptyDb, {
      albumId: emptyAlbumId,
      fetcher: {
        getAlbumInfo: async () => ({
          imageUrl: "https://lastfm.freetls.fastly.net/i/u/300x300/noxz.png",
          tracks: [],
        }),
      },
    })

    const album = await getAlbumDetail(emptyDb, { albumId: emptyAlbumId })
    expect(album!.lastfmEnrichedAt).toBeInstanceOf(Date)
    expect(album!.tracks.map((t) => t.trackName)).toEqual(["Dreaming Wide Awake"])

    await emptyClient.close()
  })
})
