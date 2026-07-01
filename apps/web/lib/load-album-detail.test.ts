import { beforeEach, describe, expect, it, vi } from "vitest"

import { enrichAlbum, enrichAlbumWithTidal } from "@workspace/db/enrichment"
import { getAlbumDetail } from "@workspace/db/queries"
import type { AlbumDetail } from "@workspace/db/queries"
import { notFound } from "next/navigation"

import { loadAlbumDetail } from "./load-album-detail"

vi.mock("@workspace/db", () => ({ db: {} }))
vi.mock("@workspace/db/enrichment", () => ({
  enrichAlbum: vi.fn(),
  enrichAlbumWithTidal: vi.fn(),
}))
vi.mock("@workspace/db/queries", () => ({ getAlbumDetail: vi.fn() }))
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))

const album = (over: Partial<AlbumDetail> = {}): AlbumDetail => ({
  albumId: 1,
  albumName: "Amber",
  artistId: 2,
  artistName: "Autechre",
  lastfmEnrichedAt: null,
  tidalEnrichedAt: null,
  imageUrl: null,
  humCount: 0,
  tracks: [],
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("loadAlbumDetail", () => {
  it("calls notFound when the album does not exist", async () => {
    vi.mocked(getAlbumDetail).mockResolvedValue(null)

    await expect(loadAlbumDetail(1)).rejects.toThrow("NEXT_NOT_FOUND")
    expect(notFound).toHaveBeenCalledOnce()
    expect(enrichAlbum).not.toHaveBeenCalled()
  })

  it("runs both passes then returns the fully enriched album on first visit", async () => {
    const enriched = album({
      lastfmEnrichedAt: new Date(),
      tidalEnrichedAt: new Date(),
    })
    vi.mocked(getAlbumDetail)
      .mockResolvedValueOnce(album()) // initial load: neither pass done
      .mockResolvedValueOnce(album({ lastfmEnrichedAt: new Date() })) // after LastFM
      .mockResolvedValueOnce(enriched) // after TIDAL

    const result = await loadAlbumDetail(1)

    expect(enrichAlbum).toHaveBeenCalledOnce()
    expect(enrichAlbumWithTidal).toHaveBeenCalledOnce()
    expect(result).toBe(enriched)
  })

  it("returns the pre-enrichment album and skips TIDAL when LastFM fails", async () => {
    const stale = album()
    vi.mocked(getAlbumDetail).mockResolvedValue(stale)
    vi.mocked(enrichAlbum).mockRejectedValue(new Error("lastfm down"))

    const result = await loadAlbumDetail(1)

    expect(result).toBe(stale)
    expect(enrichAlbumWithTidal).not.toHaveBeenCalled()
  })

  it("returns the LastFM-enriched album when only the TIDAL pass fails", async () => {
    const lastfmOnly = album({ lastfmEnrichedAt: new Date() })
    vi.mocked(getAlbumDetail).mockResolvedValue(lastfmOnly)
    vi.mocked(enrichAlbumWithTidal).mockRejectedValue(new Error("tidal down"))

    const result = await loadAlbumDetail(1)

    expect(enrichAlbum).not.toHaveBeenCalled()
    expect(enrichAlbumWithTidal).toHaveBeenCalledOnce()
    expect(result).toBe(lastfmOnly)
  })

  it("runs neither pass when the album is already fully enriched", async () => {
    const done = album({
      lastfmEnrichedAt: new Date(),
      tidalEnrichedAt: new Date(),
    })
    vi.mocked(getAlbumDetail).mockResolvedValue(done)

    const result = await loadAlbumDetail(1)

    expect(enrichAlbum).not.toHaveBeenCalled()
    expect(enrichAlbumWithTidal).not.toHaveBeenCalled()
    expect(result).toBe(done)
  })
})
