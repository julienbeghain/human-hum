import { type ZodType, z } from "zod"

import { env } from "./env"

const TIDAL_AUTH_URL = "https://auth.tidal.com/v1/oauth2/token"
const TIDAL_API_BASE = "https://openapi.tidal.com/v2/"
// Hardcoded market scope (ADR-0005). Becomes a per-user-profile value under auth.
const COUNTRY_CODE = "GB"
// Refresh slightly before the real expiry so an in-flight request never races
// a token that lapses mid-call.
const EXPIRY_MARGIN_MS = 60_000

/**
 * Error thrown when a TIDAL endpoint responds with a non-OK status. Carries the
 * HTTP `status` so callers can distinguish a retryable 429/5xx from a fatal
 * client error without parsing the message (mirrors {@link LastfmApiError}).
 */
export class TidalApiError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string
  ) {
    super(`TIDAL API error: ${status} ${statusText}`)
    this.name = "TidalApiError"
  }
}

const tokenSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
})

let cachedToken: { value: string; expiresAt: number } | null = null

/**
 * Fetch (and cache in-memory) a client-credentials app token for TIDAL catalog
 * reads. Returns the cached token until it nears expiry, then re-fetches. Throws
 * {@link TidalApiError} on a non-OK response.
 */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value
  }

  const credentials = Buffer.from(
    `${env.TIDAL_CLIENT_ID}:${env.TIDAL_CLIENT_SECRET}`
  ).toString("base64")

  const response = await fetch(TIDAL_AUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  })
  if (!response.ok) {
    throw new TidalApiError(response.status, response.statusText)
  }

  const { access_token, expires_in } = tokenSchema.parse(await response.json())
  cachedToken = {
    value: access_token,
    expiresAt: Date.now() + expires_in * 1000 - EXPIRY_MARGIN_MS,
  }
  return access_token
}

/**
 * Fetch a TIDAL catalog URL with a bearer token and validate the JSON:API body
 * against `schema`. Throws {@link TidalApiError} on a non-OK response, or a
 * `ZodError` if the body does not match (mirrors `lastfmFetch`).
 */
async function tidalFetch<T>(url: URL, schema: ZodType<T>): Promise<T> {
  const token = await getAccessToken()
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.api+json",
    },
  })
  if (!response.ok) {
    throw new TidalApiError(response.status, response.statusText)
  }
  return schema.parse(await response.json())
}

// JSON:API splits linkage from resources: `include=albums` embeds the album
// objects in `included`, so we map those rather than the id/type-only `data`.
const albumResourceSchema = z.object({
  id: z.string(),
  type: z.literal("albums"),
  attributes: z.object({
    title: z.string(),
    popularity: z.number(),
  }),
})

const searchAlbumsDocumentSchema = z.object({
  data: z.array(z.object({ id: z.string(), type: z.string() })),
  included: z.array(albumResourceSchema).optional(),
})

export interface TidalAlbum {
  id: string
  title: string
  popularity: number
}

/**
 * Free-text album search against the TIDAL catalog. Returns the matched album
 * resources (id, title, popularity) for the caller to disambiguate. ISRCs and
 * links are attached later from per-album lookups, not this search.
 */
export async function searchTidalAlbums(query: string): Promise<TidalAlbum[]> {
  const url = new URL(
    `searchResults/${encodeURIComponent(query)}/relationships/albums`,
    TIDAL_API_BASE
  )
  url.searchParams.set("countryCode", COUNTRY_CODE)
  url.searchParams.set("include", "albums")

  const document = await tidalFetch(url, searchAlbumsDocumentSchema)
  return (document.included ?? []).map((album) => ({
    id: album.id,
    title: album.attributes.title,
    popularity: album.attributes.popularity,
  }))
}
