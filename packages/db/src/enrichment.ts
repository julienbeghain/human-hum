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

// A single enrichment source's pass over one album. `matched` records whether
// the source supplied displayed metadata for the album; a completed pass that
// found nothing returns `matched: false` (a no-match is still done — ADR-0008).
// A transient failure throws instead, so the orchestrator records no row and
// the pass retries on the album's next visit.
export interface EnrichmentOutcome {
  matched: boolean
}

export type EnrichmentSourceName = "lastfm" | "tidal"

export interface EnrichmentSource {
  readonly name: EnrichmentSourceName
  enrich(db: Database, opts: { albumId: number }): Promise<EnrichmentOutcome>
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

// LastFM `album.getInfo`: the floor of the ladder. It creates `album_tracks`
// and fills artwork, and (unlike TIDAL) always matches when the fetch succeeds.
export class LastfmEnrichmentSource implements EnrichmentSource {
  readonly name = "lastfm" as const

  constructor(private readonly fetcher: AlbumInfoFetcher) {}

  async enrich(
    db: Database,
    { albumId }: { albumId: number }
  ): Promise<EnrichmentOutcome> {
    const [album] = await db
      .select({ name: schema.albums.name, artistId: schema.albums.artistId })
      .from(schema.albums)
      .where(eq(schema.albums.id, albumId))

    if (!album) {
      throw new Error(`Album not found: ${albumId}`)
    }

    const artistName = await requireArtistName(db, album.artistId)

    const result = await this.fetcher.getAlbumInfo({
      albumName: album.name,
      artistName,
    })

    // Ordered, not transactional: the neon-http driver has no interactive
    // transactions, so we write the tracklist and artwork here and let the
    // orchestrator commit the album_sources completion row last — only after
    // this returns. A failure before it leaves no row, and the album page's
    // on-visit gate retries. The delete makes the track write idempotent so a
    // retry after a partial run heals instead of colliding on the (album_id,
    // track_number) PK.
    await db
      .delete(schema.albumTracks)
      .where(eq(schema.albumTracks.albumId, albumId))

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
      .set({ imageUrl: result.imageUrl })
      .where(eq(schema.albums.id, albumId))

    return { matched: true }
  }
}

export interface TidalCatalogFetcher {
  searchAlbums(query: string): Promise<TidalAlbum[]>
  getAlbum(albumId: string): Promise<TidalAlbumDetail>
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

// TIDAL catalog: repairs missing/placeholder artwork with a confidently matched
// catalog cover. It runs below LastFM in the ladder (orchestrator order), so it
// reads the artwork LastFM already set. `matched` is whether TIDAL supplied a
// cover; genuine existing artwork or an unfindable album is a completed no-match.
export class TidalEnrichmentSource implements EnrichmentSource {
  readonly name = "tidal" as const

  constructor(private readonly fetcher: TidalCatalogFetcher) {}

  async enrich(
    db: Database,
    { albumId }: { albumId: number }
  ): Promise<EnrichmentOutcome> {
    const [album] = await db
      .select({
        name: schema.albums.name,
        artistId: schema.albums.artistId,
        imageUrl: schema.albums.imageUrl,
      })
      .from(schema.albums)
      .where(eq(schema.albums.id, albumId))

    if (!album) {
      throw new Error(`Album not found: ${albumId}`)
    }

    // Genuine LastFM art needs no catalog call; TIDAL contributes nothing.
    if (!isMissingArtwork(album.imageUrl)) {
      return { matched: false }
    }

    const artistName = await requireArtistName(db, album.artistId)

    const coverArtUrl = await findTidalCoverArt(this.fetcher, {
      name: album.name,
      artistName,
    })

    if (!coverArtUrl) {
      return { matched: false }
    }

    await db
      .update(schema.albums)
      .set({ imageUrl: coverArtUrl })
      .where(eq(schema.albums.id, albumId))

    return { matched: true }
  }
}

function createDefaultSources(): EnrichmentSource[] {
  return [
    new LastfmEnrichmentSource(new LastfmAlbumInfoFetcher(env.LASTFM_API_KEY)),
    new TidalEnrichmentSource({
      searchAlbums: searchTidalAlbums,
      getAlbum: getTidalAlbum,
    }),
  ]
}

// The single on-visit enrichment orchestrator. Runs each source in priority
// order (LastFM first, then TIDAL), self-gating each on its own album_sources
// row: a completed pass — match or no-match — is never re-run, while a source
// that threw wrote no row and retries next visit. A transient failure stops the
// ladder for this visit, since a lower rung reads what a higher rung wrote.
export async function enrichAlbum(
  db: Database,
  opts: { albumId: number; sources?: EnrichmentSource[] }
): Promise<void> {
  const { albumId } = opts
  const sources = opts.sources ?? createDefaultSources()

  const [album] = await db
    .select({ id: schema.albums.id })
    .from(schema.albums)
    .where(eq(schema.albums.id, albumId))

  if (!album) {
    throw new Error(`Album not found: ${albumId}`)
  }

  const done = await db
    .select({ source: schema.albumSources.source })
    .from(schema.albumSources)
    .where(eq(schema.albumSources.albumId, albumId))
  const completed = new Set(done.map((r) => r.source))

  for (const source of sources) {
    if (completed.has(source.name)) continue

    try {
      const { matched } = await source.enrich(db, { albumId })
      await db.insert(schema.albumSources).values({
        albumId,
        source: source.name,
        enrichedAt: new Date(),
        matched,
      })
    } catch (error) {
      console.error(
        `${source.name} album enrichment failed for albumId=${albumId}:`,
        error
      )
      break
    }
  }
}
