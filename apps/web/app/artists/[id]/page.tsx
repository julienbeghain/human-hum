import Link from "next/link"
import { notFound } from "next/navigation"

import { db } from "@workspace/db"
import { getArtistDetail } from "@workspace/db/queries"

import { HumCountTable } from "@/components/hum-count-table"

export default async function ArtistDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id: rawId } = await props.params
  const artistId = Number(rawId)

  if (!Number.isFinite(artistId) || artistId < 1) notFound()

  const artist = await getArtistDetail(db, { artistId })

  if (!artist) notFound()

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{artist.artistName}</h1>
        <p className="text-muted-foreground">
          {artist.humCount.toLocaleString()} hums
        </p>
      </div>

      <HumCountTable
        title="Top tracks"
        itemHeader="Track"
        rows={artist.topTracks.map((track, index) => ({
          key: track.trackId,
          rank: index + 1,
          label: track.trackName,
          humCount: track.humCount,
        }))}
      />

      <HumCountTable
        title="Top albums"
        itemHeader="Album"
        rows={artist.topAlbums.map((album, index) => ({
          key: album.albumId,
          rank: index + 1,
          label: (
            <Link href={`/albums/${album.albumId}`} className="hover:underline">
              {album.albumName}
            </Link>
          ),
          humCount: album.humCount,
        }))}
      />
    </div>
  )
}
