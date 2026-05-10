import Link from "next/link"

import { db } from "@workspace/db"
import { getArtistRankings } from "@workspace/db/queries"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

export default async function ArtistsPage() {
  const rankings = await getArtistRankings(db)

  return (
    <div className="flex flex-col gap-4 p-6">
      {rankings.length === 0 ? (
        <p className="text-muted-foreground">
          No artists yet. Import some listening history first.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Artist</TableHead>
              <TableHead className="text-right">Scrobbles</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rankings.map((artist, index) => (
              <TableRow key={artist.artistId}>
                <TableCell className="text-muted-foreground">
                  {index + 1}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/artists/${artist.artistId}`}
                    className="hover:underline"
                  >
                    {artist.artistName}
                  </Link>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {artist.playCount.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
