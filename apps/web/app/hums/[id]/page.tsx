import Link from "next/link"
import { notFound } from "next/navigation"

import { db } from "@workspace/db"
import { getHumById } from "@workspace/db/queries"

function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(date)
}

export default async function HumDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id: rawId } = await props.params
  const id = Number(rawId)

  if (!Number.isFinite(id) || id < 1) notFound()

  const hum = await getHumById(db, id)

  if (!hum) notFound()

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{hum.trackName}</h1>
        <p className="text-lg text-muted-foreground">
          <Link
            href={`/artists/${hum.artistId}`}
            className="hover:underline"
          >
            {hum.artistName}
          </Link>
        </p>
        {hum.albumId && hum.albumName && (
          <p className="text-muted-foreground">
            <Link
              href={`/albums/${hum.albumId}`}
              className="hover:underline"
            >
              {hum.albumName}
            </Link>
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Played</dt>
          <dd className="text-sm font-medium">
            {formatTimestamp(hum.listenedAt)}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Source</dt>
          <dd className="text-sm font-medium capitalize">{hum.source}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Track plays</dt>
          <dd className="text-sm font-medium">
            {hum.trackHumCount.toLocaleString()}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Artist plays</dt>
          <dd className="text-sm font-medium">
            {hum.artistHumCount.toLocaleString()}
          </dd>
        </div>
      </dl>
    </div>
  )
}
