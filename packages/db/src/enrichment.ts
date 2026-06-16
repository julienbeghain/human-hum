import { eq } from "drizzle-orm"
import { z } from "zod"

import { env } from "./env"
import type { Database } from "./index"
import { lastfmFetch, lastfmUrl } from "./lastfm-api"
import * as schema from "./schema"

export function normalizeTrackName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\(([^)]+)\)\s*/g, " $1 ")
    .replace(/\s+-\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export interface AlbumInfoResult {
  imageUrl: string | null
  tracks: Array<{ name: string; trackNumber: number; duration: number | null }>
}

export interface AlbumInfoFetcher {
  getAlbumInfo(params: {
    albumName: string
    artistName: string
  }): Promise<AlbumInfoResult>
}

// Unlike user.getRecentTracks (which serializes numbers as strings), the
// album.getInfo endpoint returns `duration` and `@attr.rank` as JSON numbers.
// z.coerce.number() tolerates both shapes so the boundary can't regress on
// either endpoint's serialization quirk.
const lastfmAlbumTrackSchema = z.object({
  name: z.string(),
  duration: z.coerce.number().optional(),
  "@attr": z.object({ rank: z.coerce.number() }),
})

const lastfmAlbumInfoSchema = z.object({
  album: z.object({
    image: z.array(z.object({ "#text": z.string() })),
    tracks: z
      .object({
        track: z.union([
          lastfmAlbumTrackSchema,
          z.array(lastfmAlbumTrackSchema),
        ]),
      })
      .optional(),
  }),
})

export class LastfmAlbumInfoFetcher implements AlbumInfoFetcher {
  constructor(private readonly apiKey: string) {}

  async getAlbumInfo(params: {
    albumName: string
    artistName: string
  }): Promise<AlbumInfoResult> {
    const url = lastfmUrl(this.apiKey, {
      method: "album.getInfo",
      artist: params.artistName,
      album: params.albumName,
    })

    const data = await lastfmFetch(url, lastfmAlbumInfoSchema)
    const images = data.album.image
    const largestImage = images[images.length - 1]
    const imageUrl =
      largestImage && largestImage["#text"] ? largestImage["#text"] : null

    const rawTracks = data.album.tracks?.track
    let trackList: z.infer<typeof lastfmAlbumTrackSchema>[]
    if (!rawTracks) {
      trackList = []
    } else if (Array.isArray(rawTracks)) {
      trackList = rawTracks
    } else {
      trackList = [rawTracks]
    }

    const tracks = trackList.map((t) => ({
      name: t.name,
      trackNumber: t["@attr"].rank,
      duration: t.duration || null,
    }))

    return { imageUrl, tracks }
  }
}

function createDefaultFetcher(): AlbumInfoFetcher {
  return new LastfmAlbumInfoFetcher(env.LASTFM_API_KEY)
}

export async function enrichAlbum(
  db: Database,
  opts: { albumId: number; fetcher?: AlbumInfoFetcher }
): Promise<void> {
  const { albumId } = opts

  const fetcher =
    opts.fetcher ?? createDefaultFetcher()

  const [album] = await db
    .select({
      lastfmEnrichedAt: schema.albums.lastfmEnrichedAt,
      name: schema.albums.name,
      artistId: schema.albums.artistId,
    })
    .from(schema.albums)
    .where(eq(schema.albums.id, albumId))

  if (!album) {
    throw new Error(`Album not found: ${albumId}`)
  }

  if (album.lastfmEnrichedAt) {
    return
  }

  const [artist] = await db
    .select({ name: schema.artists.name })
    .from(schema.artists)
    .where(eq(schema.artists.id, album.artistId))

  if (!artist) {
    throw new Error(`Artist not found: ${album.artistId}`)
  }

  const result = await fetcher.getAlbumInfo({
    albumName: album.name,
    artistName: artist.name,
  })

  // Ordered, not transactional: the neon-http driver has no interactive
  // transactions, so we write so that lastfm_enriched_at — the completion
  // marker — commits last, only after the tracklist is durable. A failure
  // before it leaves lastfm_enriched_at null and the album page's on-visit
  // gate retries. The delete makes the track write idempotent so a retry
  // after a partial run heals instead of colliding on the (album_id,
  // track_number) PK. This path is short-lived: TIDAL is expected to
  // supersede Last.fm enrichment.
  await db.delete(schema.albumTracks).where(eq(schema.albumTracks.albumId, albumId))

  if (result.tracks.length > 0) {
    const artistTracks = await db
      .select({ id: schema.tracks.id, name: schema.tracks.name })
      .from(schema.tracks)
      .where(eq(schema.tracks.artistId, album.artistId))

    const trackRows = result.tracks.map((t) => {
      const normalized = normalizeTrackName(t.name)
      const match = artistTracks.find(
        (at) => normalizeTrackName(at.name) === normalized
      )

      return {
        albumId,
        trackNumber: t.trackNumber,
        name: t.name,
        trackId: match?.id ?? null,
        duration: t.duration,
      }
    })

    await db.insert(schema.albumTracks).values(trackRows)
  }

  await db
    .update(schema.albums)
    .set({
      imageUrl: result.imageUrl,
      lastfmEnrichedAt: new Date(),
    })
    .where(eq(schema.albums.id, albumId))
}
