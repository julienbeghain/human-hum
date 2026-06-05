import type { ZodType } from "zod"

const LASTFM_API_BASE = "https://ws.audioscrobbler.com/2.0/"

/**
 * Error thrown when the LastFM API responds with a non-OK status. Carries the
 * HTTP `status` so callers (e.g. retry loops) can distinguish a retryable 429
 * from a fatal client error without parsing the message.
 */
export class LastfmApiError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string
  ) {
    super(`LastFM API error: ${status} ${statusText}`)
    this.name = "LastfmApiError"
  }
}

/**
 * Build a LastFM API URL with the shared `api_key` and `format=json` params
 * applied. Caller-supplied params (method, user, album, etc.) are set first.
 */
export function lastfmUrl(
  apiKey: string,
  params: Record<string, string>
): URL {
  const url = new URL(LASTFM_API_BASE)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  url.searchParams.set("api_key", apiKey)
  url.searchParams.set("format", "json")
  return url
}

/**
 * Fetch a LastFM API URL and validate the JSON body against `schema`. Throws
 * {@link LastfmApiError} on a non-OK response, or a `ZodError` if the body does
 * not match the schema. Does not retry — callers needing backoff catch the
 * error and inspect its `status`.
 */
export async function lastfmFetch<T>(
  url: URL,
  schema: ZodType<T>
): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new LastfmApiError(response.status, response.statusText)
  }
  return schema.parse(await response.json())
}
