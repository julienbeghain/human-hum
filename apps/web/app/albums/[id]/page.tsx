import { IconDisc } from "@tabler/icons-react"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"

import { db } from "@workspace/db"
import { enrichAlbum } from "@workspace/db/enrichment"
import { getAlbumDetail } from "@workspace/db/queries"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

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

      {album.tracks.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Tracks</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Track</TableHead>
                <TableHead className="text-right">Scrobbles</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {album.tracks.map((track, index) => (
                <TableRow key={track.trackId ?? `unmatched-${index}`}>
                  <TableCell className="text-muted-foreground">
                    {track.trackNumber ?? index + 1}
                  </TableCell>
                  <TableCell>{track.trackName}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {track.playCount.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  )
}
