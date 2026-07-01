import { notFound } from "next/navigation"

import { db } from "@workspace/db"
import { enrichAlbum, enrichAlbumWithTidal } from "@workspace/db/enrichment"
import { getAlbumDetail } from "@workspace/db/queries"

export async function loadAlbumDetail(albumId: number) {
  let album = await getAlbumDetail(db, { albumId })

  if (!album) notFound()

  // Two independent, self-gating passes — LastFM then TIDAL — each with its own
  // try/catch so one source's failure degrades to existing data without
  // touching the other.
  if (!album.lastfmEnrichedAt) {
    try {
      await enrichAlbum(db, { albumId })
      album = (await getAlbumDetail(db, { albumId }))!
    } catch (error) {
      console.error(`LastFM album enrichment failed for albumId=${albumId}:`, error)
      return album
    }
  }

  if (album.lastfmEnrichedAt && !album.tidalEnrichedAt) {
    try {
      await enrichAlbumWithTidal(db, { albumId })
      album = (await getAlbumDetail(db, { albumId }))!
    } catch (error) {
      console.error(`TIDAL album enrichment failed for albumId=${albumId}:`, error)
      return album
    }
  }

  return album
}
