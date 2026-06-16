import { IconDisc } from "@tabler/icons-react"
import Image from "next/image"
import Link from "next/link"

import type { AlbumDetail } from "@workspace/db/queries"

type AlbumHeaderProps = Pick<
  AlbumDetail,
  "imageUrl" | "albumName" | "artistId" | "artistName" | "humCount"
>

// Cover provenance is carried by the image host: TIDAL serves artwork from
// resources.tidal.com, LastFM from its own CDN. We badge TIDAL-sourced covers.
function isTidalArtwork(imageUrl: string): boolean {
  return imageUrl.includes("resources.tidal.com")
}

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
        <div className="relative shrink-0">
          <Image
            src={imageUrl}
            alt={`${albumName} cover art`}
            width={160}
            height={160}
            className="rounded-md"
          />
          {isTidalArtwork(imageUrl) && (
            <span
              className="absolute right-1 bottom-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold tracking-widest text-white uppercase"
              title="Artwork from TIDAL"
            >
              TIDAL
            </span>
          )}
        </div>
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
