import type { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.setConfig({ hookTimeout: 30_000 })

import type { Database } from "../index"
import type { ListenInput, Source } from "../ingestion"
import { getScrobbles } from "../queries"
import { setupTestDb } from "../test-utils"
import type {
  FetchPageParams,
  FetchPageResult,
  NowPlayingTrack,
  PageProgress,
  SourceFetcher,
} from "./source-fetcher"
import { importScrobbles, syncScrobbles } from "./source-fetcher"

// --- Fake SourceFetcher ---

function makeListen(
  artist: string,
  track: string,
  listenedAt: string,
  album?: string
): ListenInput {
  return {
    artist: { name: artist },
    track: { name: track },
    ...(album ? { album: { name: album } } : {}),
    listenedAt: new Date(listenedAt),
    source: "lastfm" as Source,
  }
}

interface FakeFetcherOptions {
  remotePlaycount?: number
  nowPlaying?: NowPlayingTrack
}

class FakeFetcher implements SourceFetcher {
  readonly source: Source = "lastfm"
  readonly calls: FetchPageParams[] = []
  getRemotePlaycount?: () => Promise<number>
  private nowPlaying?: NowPlayingTrack

  constructor(pages: ListenInput[][], options?: FakeFetcherOptions)
  constructor(pages: ListenInput[][], remotePlaycount?: number)
  constructor(
    private pages: ListenInput[][],
    optionsOrPlaycount?: FakeFetcherOptions | number
  ) {
    const opts =
      typeof optionsOrPlaycount === "number"
        ? { remotePlaycount: optionsOrPlaycount }
        : optionsOrPlaycount
    if (opts?.remotePlaycount !== undefined) {
      this.getRemotePlaycount = async () => opts.remotePlaycount!
    }
    this.nowPlaying = opts?.nowPlaying
  }

  async fetchPage(params: FetchPageParams): Promise<FetchPageResult> {
    this.calls.push({ ...params })
    const pageIndex = params.page - 1
    const listens = this.pages[pageIndex] ?? []
    return {
      listens,
      totalPages: this.pages.length,
      skippedCount: this.nowPlaying ? 1 : 0,
      nowPlaying: this.nowPlaying,
    }
  }
}

// --- Tests ---

let client: PGlite
let db: Database

beforeAll(async () => {
  ;({ db, client } = await setupTestDb())
})

afterAll(async () => {
  await client.close()
})

describe("importScrobbles", () => {
  it("imports a single page of listens into the database", async () => {
    const listens = [
      makeListen("Autechre", "Clipper", "2020-06-01T10:00:00Z"),
      makeListen("Autechre", "Bike", "2020-06-01T10:05:00Z"),
    ]
    const fetcher = new FakeFetcher([listens])

    const result = await importScrobbles(db, fetcher, { backfill: true })

    expect(result.totalImported).toBe(2)
    expect(result.totalSkipped).toBe(0)
    expect(result.pagesProcessed).toBe(1)

    const { rows } = await getScrobbles(db)
    const trackNames = rows.map((r) => r.trackName)
    expect(trackNames).toContain("Clipper")
    expect(trackNames).toContain("Bike")
  })

  it("paginates through multiple pages on backfill", async () => {
    // Fresh DB for this test
    const { db: freshDb, client: freshClient } = await setupTestDb()
    try {
      const page1 = [makeListen("BoC", "Roygbiv", "2024-01-01T10:00:00Z")]
      const page2 = [makeListen("BoC", "Aquarius", "2024-01-01T11:00:00Z")]
      const fetcher = new FakeFetcher([page1, page2])

      const result = await importScrobbles(freshDb, fetcher, { backfill: true })

      expect(result.pagesProcessed).toBe(2)
      expect(result.totalImported).toBe(2)
      expect(fetcher.calls.length).toBe(2)
      expect(fetcher.calls[0]!.page).toBe(1)
      expect(fetcher.calls[1]!.page).toBe(2)
    } finally {
      await freshClient.close()
    }
  })

  it("deduplicates already-imported listens", async () => {
    const { db: freshDb, client: freshClient } = await setupTestDb()
    try {
      const listens = [
        makeListen("Aphex Twin", "Windowlicker", "2026-01-15T20:00:00Z"),
      ]
      const fetcher = new FakeFetcher([listens])

      // Import once
      await importScrobbles(freshDb, fetcher, { backfill: true })
      // Import same data again
      const result = await importScrobbles(freshDb, fetcher, { backfill: true })

      expect(result.totalImported).toBe(0)
      expect(result.totalSkipped).toBe(1)
    } finally {
      await freshClient.close()
    }
  })

  it("falls back to backfill when DB is empty and no from is set", async () => {
    const { db: freshDb, client: freshClient } = await setupTestDb()
    try {
      const listens = [
        makeListen("Burial", "Archangel", "2024-06-01T22:00:00Z"),
      ]
      const fetcher = new FakeFetcher([listens])

      // No backfill flag, no from — should detect empty DB and backfill
      const result = await importScrobbles(freshDb, fetcher, {})

      expect(result.totalImported).toBe(1)
      expect(result.pagesProcessed).toBe(1)
    } finally {
      await freshClient.close()
    }
  })

  it("incremental sync sets from based on latest scrobble", async () => {
    const { db: freshDb, client: freshClient } = await setupTestDb()
    try {
      // Seed one existing scrobble
      const seed = [makeListen("Burial", "Archangel", "2024-06-01T22:00:00Z")]
      const seedFetcher = new FakeFetcher([seed])
      await importScrobbles(freshDb, seedFetcher, { backfill: true })

      // Now incremental sync — fetcher should receive from ≈ latest - 1s
      const newListens = [
        makeListen("Burial", "Ghost Hardware", "2024-06-02T10:00:00Z"),
      ]
      const syncFetcher = new FakeFetcher([newListens])

      await importScrobbles(freshDb, syncFetcher, {})

      expect(syncFetcher.calls.length).toBe(1)
      const fromParam = syncFetcher.calls[0]!.from!
      // Should be ~1 second before the latest scrobble
      const expectedFrom = new Date("2024-06-01T21:59:59Z")
      expect(fromParam.getTime()).toBe(expectedFrom.getTime())
    } finally {
      await freshClient.close()
    }
  })

  it("backfill resume sets to based on earliest scrobble", async () => {
    const { db: freshDb, client: freshClient } = await setupTestDb()
    try {
      // Seed existing data (as if a partial backfill already ran)
      const seed = [makeListen("BoC", "Roygbiv", "2024-05-01T10:00:00Z")]
      const seedFetcher = new FakeFetcher([seed])
      await importScrobbles(freshDb, seedFetcher, { backfill: true })

      // Resume backfill — should set to = earliest + 1s
      const olderListens = [
        makeListen("BoC", "Turquoise Hexagon Sun", "2024-01-01T08:00:00Z"),
      ]
      const resumeFetcher = new FakeFetcher([olderListens])

      await importScrobbles(freshDb, resumeFetcher, { backfill: true })

      expect(resumeFetcher.calls.length).toBe(1)
      const toParam = resumeFetcher.calls[0]!.to!
      const expectedTo = new Date("2024-05-01T10:00:01Z")
      expect(toParam.getTime()).toBe(expectedTo.getTime())
    } finally {
      await freshClient.close()
    }
  })

  it("calls onProgress for each page", async () => {
    const { db: freshDb, client: freshClient } = await setupTestDb()
    try {
      const page1 = [makeListen("Squarepusher", "Beep Street", "2024-01-01T10:00:00Z")]
      const page2 = [makeListen("Squarepusher", "My Red Hot Car", "2024-01-01T11:00:00Z")]
      const fetcher = new FakeFetcher([page1, page2])

      const progress: PageProgress[] = []
      await importScrobbles(freshDb, fetcher, {
        backfill: true,
        onProgress: (p) => progress.push({ ...p }),
      })

      expect(progress.length).toBe(2)
      expect(progress[0]!.page).toBe(1)
      expect(progress[0]!.imported).toBe(1)
      expect(progress[1]!.page).toBe(2)
      expect(progress[1]!.totalPages).toBe(2)
    } finally {
      await freshClient.close()
    }
  })

  it("checks completeness after backfill when fetcher provides getRemotePlaycount", async () => {
    const { db: freshDb, client: freshClient } = await setupTestDb()
    try {
      const listens = [
        makeListen("Clark", "Ted", "2024-01-01T10:00:00Z"),
        makeListen("Clark", "Herr Bar", "2024-01-01T11:00:00Z"),
      ]
      const fetcher = new FakeFetcher([listens], 10)

      const result = await importScrobbles(freshDb, fetcher, { backfill: true })

      expect(result.completeness).toBeDefined()
      expect(result.completeness!.localCount).toBe(2)
      expect(result.completeness!.remotePlaycount).toBe(10)
      expect(result.completeness!.coveragePercent).toBe(20)
    } finally {
      await freshClient.close()
    }
  })

  it("skips completeness check when fetcher has no getRemotePlaycount", async () => {
    const { db: freshDb, client: freshClient } = await setupTestDb()
    try {
      const listens = [makeListen("Clark", "Ted", "2024-01-01T10:00:00Z")]
      const fetcher = new FakeFetcher([listens])

      const result = await importScrobbles(freshDb, fetcher, { backfill: true })

      expect(result.completeness).toBeUndefined()
    } finally {
      await freshClient.close()
    }
  })
})

describe("syncScrobbles", () => {
  it("skips import when no new data available", async () => {
    const { db: freshDb, client: freshClient } = await setupTestDb()
    try {
      // Seed existing data
      const seed = [makeListen("Burial", "Archangel", "2024-06-01T22:00:00Z")]
      await importScrobbles(freshDb, new FakeFetcher([seed]), { backfill: true })

      // Probe returns empty — nothing to sync
      const fetcher = new FakeFetcher([[]])

      const result = await syncScrobbles(freshDb, fetcher)

      expect(result.needsSync).toBe(false)
      expect(result.imported).toBe(0)
      expect(result.pagesProcessed).toBe(0)
    } finally {
      await freshClient.close()
    }
  })

  it("imports new scrobbles when available", async () => {
    const { db: freshDb, client: freshClient } = await setupTestDb()
    try {
      // Seed existing data
      const seed = [makeListen("Burial", "Archangel", "2024-06-01T22:00:00Z")]
      await importScrobbles(freshDb, new FakeFetcher([seed]), { backfill: true })

      // New data available
      const newListens = [
        makeListen("Burial", "Ghost Hardware", "2024-06-02T10:00:00Z"),
        makeListen("Burial", "Near Dark", "2024-06-02T10:05:00Z"),
      ]
      const fetcher = new FakeFetcher([newListens])

      const result = await syncScrobbles(freshDb, fetcher)

      expect(result.needsSync).toBe(true)
      expect(result.imported).toBe(2)
      expect(result.pagesProcessed).toBe(1)

      const { rows } = await getScrobbles(freshDb)
      expect(rows.length).toBe(3)
    } finally {
      await freshClient.close()
    }
  })

  it("includes now-playing information", async () => {
    const { db: freshDb, client: freshClient } = await setupTestDb()
    try {
      const seed = [makeListen("Autechre", "Clipper", "2024-01-01T10:00:00Z")]
      await importScrobbles(freshDb, new FakeFetcher([seed]), { backfill: true })

      const nowPlaying: NowPlayingTrack = {
        trackName: "Gantz Graf",
        artistName: "Autechre",
        albumName: "Gantz Graf EP",
      }
      const fetcher = new FakeFetcher([[]], { nowPlaying })

      const result = await syncScrobbles(freshDb, fetcher)

      expect(result.nowPlaying).toEqual(nowPlaying)
    } finally {
      await freshClient.close()
    }
  })

  it("calls onProgress during import", async () => {
    const { db: freshDb, client: freshClient } = await setupTestDb()
    try {
      const seed = [makeListen("BoC", "Roygbiv", "2024-01-01T10:00:00Z")]
      await importScrobbles(freshDb, new FakeFetcher([seed]), { backfill: true })

      const page1 = [makeListen("BoC", "Aquarius", "2024-01-02T10:00:00Z")]
      const page2 = [makeListen("BoC", "Happy Cycling", "2024-01-03T10:00:00Z")]
      const fetcher = new FakeFetcher([page1, page2])

      const progress: PageProgress[] = []
      await syncScrobbles(freshDb, fetcher, {
        onProgress: (p) => progress.push({ ...p }),
      })

      expect(progress.length).toBe(2)
      expect(progress[0]!.page).toBe(1)
      expect(progress[1]!.page).toBe(2)
    } finally {
      await freshClient.close()
    }
  })

  it("performs full backfill on empty database", async () => {
    const { db: freshDb, client: freshClient } = await setupTestDb()
    try {
      const listens = [
        makeListen("Clark", "Ted", "2024-01-01T10:00:00Z"),
        makeListen("Clark", "Herr Bar", "2024-01-01T11:00:00Z"),
      ]
      const fetcher = new FakeFetcher([listens])

      const result = await syncScrobbles(freshDb, fetcher)

      expect(result.needsSync).toBe(true)
      expect(result.imported).toBe(2)
    } finally {
      await freshClient.close()
    }
  })
})
