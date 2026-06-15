import Link from "next/link"

import type { getHumById } from "@workspace/db/queries"

type Hum = NonNullable<Awaited<ReturnType<typeof getHumById>>>

type HumHeaderProps = Pick<
  Hum,
  "trackName" | "artistId" | "artistName" | "albumId" | "albumName"
>

export function HumHeader({
  trackName,
  artistId,
  artistName,
  albumId,
  albumName,
}: HumHeaderProps) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold">{trackName}</h1>
      <p className="text-lg text-muted-foreground">
        <Link href={`/artists/${artistId}`} className="hover:underline">
          {artistName}
        </Link>
      </p>
      {albumId && albumName && (
        <p className="text-muted-foreground">
          <Link href={`/albums/${albumId}`} className="hover:underline">
            {albumName}
          </Link>
        </p>
      )}
    </div>
  )
}
