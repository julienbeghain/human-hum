import Link from "next/link"
import { notFound } from "next/navigation"

import { db } from "@workspace/db"
import { getScrobbleById } from "@workspace/db/queries"

function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(date)
}

export default async function ScrobbleDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id: rawId } = await props.params
  const id = Number(rawId)

  if (!Number.isFinite(id) || id < 1) notFound()

  const scrobble = await getScrobbleById(db, id)

  if (!scrobble) notFound()

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{scrobble.trackName}</h1>
        <p className="text-lg text-muted-foreground">
          <Link
            href={`/artists/${scrobble.artistId}`}
            className="hover:underline"
          >
            {scrobble.artistName}
          </Link>
        </p>
        {scrobble.albumId && scrobble.albumName && (
          <p className="text-muted-foreground">
            <Link
              href={`/albums/${scrobble.albumId}`}
              className="hover:underline"
            >
              {scrobble.albumName}
            </Link>
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Played</dt>
          <dd className="text-sm font-medium">
            {formatTimestamp(scrobble.listenedAt)}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Source</dt>
          <dd className="text-sm font-medium capitalize">{scrobble.source}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Track plays</dt>
          <dd className="text-sm font-medium">
            {scrobble.trackPlayCount.toLocaleString()}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Artist plays</dt>
          <dd className="text-sm font-medium">
            {scrobble.artistPlayCount.toLocaleString()}
          </dd>
        </div>
      </dl>
    </div>
  )
}
