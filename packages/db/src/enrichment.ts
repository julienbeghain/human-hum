import { and, eq } from "drizzle-orm"

import type { Database } from "./index"
import * as schema from "./schema"

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

interface LastfmImage {
  "#text": string
  size: string
}

interface LastfmAlbumTrack {
  name: string
  duration: string
  "@attr": { rank: string }
}

interface LastfmAlbumInfoResponse {
  album: {
    image: LastfmImage[]
    tracks?: { track: LastfmAlbumTrack | LastfmAlbumTrack[] }
  }
}

export class LastfmAlbumInfoFetcher implements AlbumInfoFetcher {
  constructor(private readonly apiKey: string) {}

  async getAlbumInfo(params: {
    albumName: string
    artistName: string
  }): Promise<AlbumInfoResult> {
    const url = new URL("https://ws.audioscrobbler.com/2.0/")
    url.searchParams.set("method", "album.getInfo")
    url.searchParams.set("artist", params.artistName)
    url.searchParams.set("album", params.albumName)
    url.searchParams.set("api_key", this.apiKey)
    url.searchParams.set("format", "json")

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(
        `LastFM API error: ${response.status} ${response.statusText}`
      )
    }

    const data = (await response.json()) as LastfmAlbumInfoResponse
    const images = data.album.image
    const largestImage = images[images.length - 1]
    const imageUrl =
      largestImage && largestImage["#text"] ? largestImage["#text"] : null

    const rawTracks = data.album.tracks?.track
    let trackList: LastfmAlbumTrack[]
    if (!rawTracks) {
      trackList = []
    } else if (Array.isArray(rawTracks)) {
      trackList = rawTracks
    } else {
      trackList = [rawTracks]
    }

    const tracks = trackList.map((t) => ({
      name: t.name,
      trackNumber: parseInt(t["@attr"].rank, 10),
      duration: t.duration ? parseInt(t.duration, 10) || null : null,
    }))

    return { imageUrl, tracks }
  }
}

export async function enrichAlbum(
  db: Database,
  opts: { albumId: number; fetcher: AlbumInfoFetcher }
): Promise<void> {
  const { albumId, fetcher } = opts

  const [album] = await db
    .select({
      enrichedAt: schema.albums.enrichedAt,
      name: schema.albums.name,
      artistId: schema.albums.artistId,
    })
    .from(schema.albums)
    .where(eq(schema.albums.id, albumId))

  if (!album) {
    throw new Error(`Album not found: ${albumId}`)
  }

  if (album.enrichedAt) {
    return
  }

  const [artist] = await db
    .select({ name: schema.artists.name })
    .from(schema.artists)
    .where(eq(schema.artists.id, album.artistId))

  const result = await fetcher.getAlbumInfo({
    albumName: album.name,
    artistName: artist!.name,
  })

  await db
    .update(schema.albums)
    .set({
      imageUrl: result.imageUrl,
      enrichedAt: new Date(),
    })
    .where(eq(schema.albums.id, albumId))

  if (result.tracks.length > 0) {
    const trackRows = await Promise.all(
      result.tracks.map(async (t) => {
        const [match] = await db
          .select({ id: schema.tracks.id })
          .from(schema.tracks)
          .where(
            and(
              eq(schema.tracks.name, t.name),
              eq(schema.tracks.artistId, album.artistId)
            )
          )
          .limit(1)

        return {
          albumId,
          trackNumber: t.trackNumber,
          name: t.name,
          trackId: match?.id ?? null,
          duration: t.duration,
        }
      })
    )

    await db.insert(schema.albumTracks).values(trackRows)
  }
}
