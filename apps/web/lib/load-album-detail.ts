import { notFound } from "next/navigation"

import { db } from "@workspace/db"
import { enrichAlbum } from "@workspace/db/enrichment"
import { getAlbumDetail } from "@workspace/db/queries"

export async function loadAlbumDetail(albumId: number) {
  const existing = await getAlbumDetail(db, { albumId })

  if (!existing) notFound()

  // The orchestrator runs the enrichment ladder and self-gates each source, so
  // a fully-enriched album is a no-op. Re-read afterwards to surface whatever
  // this visit's passes wrote.
  await enrichAlbum(db, { albumId })

  return (await getAlbumDetail(db, { albumId }))!
}
