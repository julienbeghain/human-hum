import { notFound } from "next/navigation"

import { AlbumHeader } from "@/components/album-header"
import { TrackTable } from "@/components/track-table"
import { loadAlbumDetail } from "@/lib/load-album-detail"

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
