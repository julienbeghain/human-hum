import { beforeEach, describe, expect, it, vi } from "vitest"

import { enrichAlbum } from "@workspace/db/enrichment"
import { getAlbumDetail } from "@workspace/db/queries"
import type { AlbumDetail } from "@workspace/db/queries"
import { notFound } from "next/navigation"

import { loadAlbumDetail } from "./load-album-detail"

vi.mock("@workspace/db", () => ({ db: {} }))
vi.mock("@workspace/db/enrichment", () => ({ enrichAlbum: vi.fn() }))
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
  imageUrl: null,
  humCount: 0,
  tracks: [],
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("loadAlbumDetail", () => {
  it("calls notFound when the album does not exist", async () => {
    vi.mocked(getAlbumDetail).mockResolvedValue(null)

    await expect(loadAlbumDetail(1)).rejects.toThrow("NEXT_NOT_FOUND")
    expect(notFound).toHaveBeenCalledOnce()
    expect(enrichAlbum).not.toHaveBeenCalled()
  })

  it("runs the enrichment orchestrator then returns the re-read album", async () => {
    const enriched = album({ imageUrl: "https://tidal/cover.jpg" })
    vi.mocked(getAlbumDetail)
      .mockResolvedValueOnce(album()) // initial existence check
      .mockResolvedValueOnce(enriched) // re-read after enrichment

    const result = await loadAlbumDetail(1)

    expect(enrichAlbum).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      albumId: 1,
    })
    expect(result).toBe(enriched)
  })
})
