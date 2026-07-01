import { eq } from "drizzle-orm"
import { z } from "zod"

import { env } from "./env"
import type { Database } from "./index"
import { lastfmFetch, lastfmUrl } from "./lastfm-api"
import * as schema from "./schema"
import {
  getTidalAlbum,
  searchTidalAlbums,
  type TidalAlbum,
  type TidalAlbumDetail,
} from "./tidal-api"

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

async function requireArtistName(
  db: Database,
  artistId: number
): Promise<string> {
  const [artist] = await db
    .select({ name: schema.artists.name })
    .from(schema.artists)
    .where(eq(schema.artists.id, artistId))

  if (!artist) {
    throw new Error(`Artist not found: ${artistId}`)
  }

  return artist.name
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

  const artistName = await requireArtistName(db, album.artistId)

  const result = await fetcher.getAlbumInfo({
    albumName: album.name,
    artistName,
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

export interface TidalCatalogFetcher {
  searchAlbums(query: string): Promise<TidalAlbum[]>
  getAlbum(albumId: string): Promise<TidalAlbumDetail>
}

function createDefaultTidalFetcher(): TidalCatalogFetcher {
  return { searchAlbums: searchTidalAlbums, getAlbum: getTidalAlbum }
}

// LastFM serves a shared star image for albums it has no artwork for; its URL
// always contains this asset hash. Treat such a value as missing so TIDAL
// repairs the placeholder case, not only the null one.
const LASTFM_PLACEHOLDER_HASH = "2a96cbd8b46e442fc41c2b86b821562f"

function isMissingArtwork(imageUrl: string | null): boolean {
  return imageUrl === null || imageUrl.includes(LASTFM_PLACEHOLDER_HASH)
}

// Album-first disambiguation, precision over recall: keep only candidates whose
// normalized title matches, take the most popular, then confirm its artist from
// the album detail. A title match with a different artist is the wrong album, so
// we return no cover rather than attach it.
async function findTidalCoverArt(
  fetcher: TidalCatalogFetcher,
  album: { name: string; artistName: string }
): Promise<string | null> {
  const candidates = await fetcher.searchAlbums(`${album.name} ${album.artistName}`)

  const normalizedTitle = normalizeTrackName(album.name)
  const titleMatches = candidates.filter(
    (c) => normalizeTrackName(c.title) === normalizedTitle
  )
  if (titleMatches.length === 0) {
    return null
  }

  const best = titleMatches.reduce((a, b) => (b.popularity > a.popularity ? b : a))
  const detail = await fetcher.getAlbum(best.id)

  if (
    !detail.artistName ||
    normalizeTrackName(detail.artistName) !== normalizeTrackName(album.artistName)
  ) {
    return null
  }

  return detail.coverArtUrl
}

async function writeTidalEnrichment(
  db: Database,
  albumId: number,
  coverArtUrl?: string | null
): Promise<void> {
  await db
    .update(schema.albums)
    .set({
      tidalEnrichedAt: new Date(),
      // Omitted on a no-match or absent cover so a genuine existing value is
      // never nulled out.
      ...(coverArtUrl ? { imageUrl: coverArtUrl } : {}),
    })
    .where(eq(schema.albums.id, albumId))
}

export async function enrichAlbumWithTidal(
  db: Database,
  opts: { albumId: number; fetcher?: TidalCatalogFetcher }
): Promise<void> {
  const { albumId } = opts
  const fetcher = opts.fetcher ?? createDefaultTidalFetcher()

  const [album] = await db
    .select({
      tidalEnrichedAt: schema.albums.tidalEnrichedAt,
      lastfmEnrichedAt: schema.albums.lastfmEnrichedAt,
      name: schema.albums.name,
      artistId: schema.albums.artistId,
      imageUrl: schema.albums.imageUrl,
    })
    .from(schema.albums)
    .where(eq(schema.albums.id, albumId))

  if (!album) {
    throw new Error(`Album not found: ${albumId}`)
  }

  // This source's pass already completed — no-match is final, so never retried.
  if (album.tidalEnrichedAt) {
    return
  }

  // Precondition: TIDAL supplements rows LastFM creates, so it no-ops until the
  // LastFM pass has run. A LastFM failure only defers TIDAL, never undoes it.
  if (!album.lastfmEnrichedAt) {
    return
  }

  // Genuine LastFM art needs no catalog call, so the artwork pass is complete.
  if (!isMissingArtwork(album.imageUrl)) {
    await writeTidalEnrichment(db, albumId)
    return
  }

  const artistName = await requireArtistName(db, album.artistId)

  const coverArtUrl = await findTidalCoverArt(fetcher, {
    name: album.name,
    artistName,
  })

  await writeTidalEnrichment(db, albumId, coverArtUrl)
}
