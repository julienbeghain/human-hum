import { notFound } from "next/navigation"

import { db } from "@workspace/db"
import { enrichAlbum, enrichAlbumWithTidal } from "@workspace/db/enrichment"
import { getAlbumDetail } from "@workspace/db/queries"

import { AlbumHeader } from "@/components/album-header"
import { TrackTable } from "@/components/track-table"

async function loadAlbumDetail(albumId: number) {
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

export default async function AlbumDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id: rawId } = await props.params
  const albumId = Number(rawId)

  if (!Number.isFinite(albumId) || albumId < 1) notFound()

  const album = await loadAlbumDetail(albumId)

  return (
    <div className="flex flex-col gap-6 p-6">
      <AlbumHeader {...album} />

      <TrackTable
        rows={album.tracks.map((track, index) => ({
          key: track.trackId ?? `unmatched-${index}`,
          trackNumber: track.trackNumber,
          trackName: track.trackName,
          humCount: track.humCount,
          duration: track.duration,
        }))}
      />
    </div>
  )
}
