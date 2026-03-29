import { describe, expect, it, vi } from "vitest"

vi.setConfig({ hookTimeout: 30_000 })

import type { ListenInput, Source } from "../ingestion"
import { setupTestDb } from "../test-utils"
import type {
  FetchPageParams,
  FetchPageResult,
  NowPlayingTrack,
  SourceFetcher,
} from "./source-fetcher"
import { importScrobbles, syncProbe } from "./source-fetcher"

// --- Fake SourceFetcher ---

function makeListen(
  artist: string,
  track: string,
  listenedAt: string
): ListenInput {
  return {
    artist: { name: artist },
    track: { name: track },
    listenedAt: new Date(listenedAt),
    source: "lastfm" as Source,
  }
}

class FakeFetcher implements SourceFetcher {
  readonly source: Source = "lastfm"
  readonly calls: FetchPageParams[] = []

  constructor(
    private pages: ListenInput[][],
    private nowPlaying?: NowPlayingTrack
  ) {}

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

describe("syncProbe", () => {
  it("returns needsSync=false when no new data", async () => {
    const { db, client } = await setupTestDb()
    try {
      // Seed one scrobble
      const seed = [makeListen("Burial", "Archangel", "2024-06-01T22:00:00Z")]
      await importScrobbles(db, new FakeFetcher([seed]), { backfill: true })

      // Probe returns empty page (no new tracks)
      const fetcher = new FakeFetcher([[]])
      const result = await syncProbe(db, fetcher)

      expect(result.needsSync).toBe(false)
      expect(result.newPageCount).toBe(1) // 1 page but 0 listens
      expect(result.nowPlaying).toBeNull()

      // Verify from param was set correctly
      const expectedFrom = new Date("2024-06-01T21:59:59Z")
      expect(fetcher.calls[0]!.from!.getTime()).toBe(expectedFrom.getTime())
      expect(fetcher.calls[0]!.pageSize).toBe(1)
    } finally {
      await client.close()
    }
  })

  it("returns needsSync=true when new tracks available", async () => {
    const { db, client } = await setupTestDb()
    try {
      // Seed existing data
      const seed = [makeListen("Burial", "Archangel", "2024-06-01T22:00:00Z")]
      await importScrobbles(db, new FakeFetcher([seed]), { backfill: true })

      // Probe returns a new track
      const newTrack = makeListen("Burial", "Ghost Hardware", "2024-06-02T10:00:00Z")
      const fetcher = new FakeFetcher([[newTrack]])

      const result = await syncProbe(db, fetcher)

      expect(result.needsSync).toBe(true)
      expect(result.newPageCount).toBe(1)
    } finally {
      await client.close()
    }
  })

  it("returns needsSync=true with correct count for multiple pages", async () => {
    const { db, client } = await setupTestDb()
    try {
      const seed = [makeListen("BoC", "Roygbiv", "2024-01-01T10:00:00Z")]
      await importScrobbles(db, new FakeFetcher([seed]), { backfill: true })

      // 3 pages of new tracks (at pageSize=1, means 3 new tracks)
      const page1 = [makeListen("BoC", "Aquarius", "2024-01-02T10:00:00Z")]
      const page2 = [makeListen("BoC", "Turquoise Hexagon Sun", "2024-01-03T10:00:00Z")]
      const page3 = [makeListen("BoC", "Happy Cycling", "2024-01-04T10:00:00Z")]
      const fetcher = new FakeFetcher([page1, page2, page3])

      const result = await syncProbe(db, fetcher)

      expect(result.needsSync).toBe(true)
      expect(result.newPageCount).toBe(3)
    } finally {
      await client.close()
    }
  })

  it("extracts now-playing track", async () => {
    const { db, client } = await setupTestDb()
    try {
      const seed = [makeListen("Autechre", "Clipper", "2024-01-01T10:00:00Z")]
      await importScrobbles(db, new FakeFetcher([seed]), { backfill: true })

      const nowPlaying: NowPlayingTrack = {
        trackName: "Gantz Graf",
        artistName: "Autechre",
        albumName: "Gantz Graf EP",
      }
      const fetcher = new FakeFetcher([[]], nowPlaying)

      const result = await syncProbe(db, fetcher)

      expect(result.nowPlaying).toEqual(nowPlaying)
    } finally {
      await client.close()
    }
  })

  it("returns needsSync=true when multiple pages but page 1 is empty", async () => {
    const { db, client } = await setupTestDb()
    try {
      const seed = [makeListen("Burial", "Archangel", "2024-06-01T22:00:00Z")]
      await importScrobbles(db, new FakeFetcher([seed]), { backfill: true })

      // API says 3 pages exist but page 1 returns no listens
      // (e.g., now-playing pushed track off page 1)
      const fetcher = new FakeFetcher([[], [], []])

      const result = await syncProbe(db, fetcher)

      expect(result.needsSync).toBe(true)
      expect(result.newPageCount).toBe(3)
    } finally {
      await client.close()
    }
  })

  it("handles empty DB (no local scrobbles)", async () => {
    const { db, client } = await setupTestDb()
    try {
      const page1 = [makeListen("Clark", "Ted", "2024-01-01T10:00:00Z")]
      const fetcher = new FakeFetcher([page1])

      const result = await syncProbe(db, fetcher)

      expect(result.needsSync).toBe(true)
      // No from param when DB is empty
      expect(fetcher.calls[0]!.from).toBeUndefined()
    } finally {
      await client.close()
    }
  })
})
