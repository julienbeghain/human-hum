import { IconDisc } from "@tabler/icons-react"
import Image from "next/image"
import Link from "next/link"

import type { getAlbumDetail } from "@workspace/db/queries"

type AlbumDetail = NonNullable<Awaited<ReturnType<typeof getAlbumDetail>>>

type AlbumHeaderProps = Pick<
  AlbumDetail,
  "imageUrl" | "albumName" | "artistId" | "artistName" | "humCount"
>

export function AlbumHeader({
  imageUrl,
  albumName,
  artistId,
  artistName,
  humCount,
}: AlbumHeaderProps) {
  return (
    <div className="flex items-start gap-5">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={`${albumName} cover art`}
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
        <h1 className="text-2xl font-semibold">{albumName}</h1>
        <p className="text-lg text-muted-foreground">
          <Link href={`/artists/${artistId}`} className="hover:underline">
            {artistName}
          </Link>
        </p>
        <p className="text-muted-foreground">
          {humCount.toLocaleString()} hums
        </p>
      </div>
    </div>
  )
}
