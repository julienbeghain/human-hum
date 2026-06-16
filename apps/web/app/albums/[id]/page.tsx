import { notFound } from "next/navigation"

import { db } from "@workspace/db"
import { enrichAlbum } from "@workspace/db/enrichment"
import { getAlbumDetail } from "@workspace/db/queries"

import { AlbumHeader } from "@/components/album-header"
import { TrackTable } from "@/components/track-table"

async function loadAlbumDetail(albumId: number) {
  const album = await getAlbumDetail(db, { albumId })

  if (!album) notFound()
  if (album.lastfmEnrichedAt) return album

  try {
    await enrichAlbum(db, { albumId })
  } catch (error) {
    // Enrichment failed — render with hum-derived fallback. Log so a broken
    // album stays diagnosable; structured logging is a deferred follow-up.
    console.error(`Album enrichment failed for albumId=${albumId}:`, error)
    return album
  }

  return (await getAlbumDetail(db, { albumId }))!
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
