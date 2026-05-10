import Link from "next/link"
import { notFound } from "next/navigation"

import { db } from "@workspace/db"
import { getArtistDetail } from "@workspace/db/queries"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

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
          {artist.playCount.toLocaleString()} scrobbles
        </p>
      </div>

      {artist.topTracks.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Top tracks</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Track</TableHead>
                <TableHead className="text-right">Scrobbles</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {artist.topTracks.map((track, index) => (
                <TableRow key={track.trackId}>
                  <TableCell className="text-muted-foreground">
                    {index + 1}
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

      {artist.topAlbums.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Top albums</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Album</TableHead>
                <TableHead className="text-right">Scrobbles</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {artist.topAlbums.map((album, index) => (
                <TableRow key={album.albumId}>
                  <TableCell className="text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/albums/${album.albumId}`}
                      className="hover:underline"
                    >
                      {album.albumName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {album.playCount.toLocaleString()}
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
