import { IconDisc } from "@tabler/icons-react"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"

import { db } from "@workspace/db"
import { enrichAlbum } from "@workspace/db/enrichment"
import { getAlbumDetail } from "@workspace/db/queries"

import { ScrobbleCountTable } from "@/components/scrobble-count-table"

export default async function AlbumDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id: rawId } = await props.params
  const albumId = Number(rawId)

  if (!Number.isFinite(albumId) || albumId < 1) notFound()

  let album = await getAlbumDetail(db, { albumId })

  if (!album) notFound()

  if (!album.enrichedAt) {
    try {
      await enrichAlbum(db, { albumId })
      album = (await getAlbumDetail(db, { albumId }))!
    } catch {
      // Enrichment failed — render with scrobble-derived fallback
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start gap-5">
        {album.imageUrl ? (
          <Image
            src={album.imageUrl}
            alt={`${album.albumName} cover art`}
            width={160}
            height={160}
            className="shrink-0 rounded-md"
          />
        ) : (
          <div className="flex size-40 shrink-0 items-center justify-center rounded-md bg-muted">
            <IconDisc className="size-12 text-muted-foreground" />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{album.albumName}</h1>
          <p className="text-lg text-muted-foreground">
            <Link
              href={`/artists/${album.artistId}`}
              className="hover:underline"
            >
              {album.artistName}
            </Link>
          </p>
          <p className="text-muted-foreground">
            {album.playCount.toLocaleString()} scrobbles
          </p>
        </div>
      </div>

      <ScrobbleCountTable
        title="Tracks"
        itemHeader="Track"
        rows={album.tracks.map((track, index) => ({
          key: track.trackId ?? `unmatched-${index}`,
          rank: track.trackNumber ?? index + 1,
          label: track.trackName,
          scrobbleCount: track.playCount,
        }))}
      />
    </div>
  )
}
