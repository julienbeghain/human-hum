"use server"

import { createDb } from "@workspace/db"
import { LastfmFetcher, syncScrobbles } from "@workspace/db/importers/lastfm"
import type { NowPlayingTrack } from "@workspace/db/importers/lastfm"

function getEnv(name: string): string | undefined {
  return process.env[name]
}

function getFetcher(): {
  db: ReturnType<typeof createDb>
  fetcher: LastfmFetcher
} | null {
  const apiKey = getEnv("LASTFM_API_KEY")
  const user = getEnv("LASTFM_USER")
  const databaseUrl = getEnv("DATABASE_URL")

  if (!apiKey || !user || !databaseUrl) return null

  return {
    db: createDb(databaseUrl),
    fetcher: new LastfmFetcher(apiKey, user),
  }
}

export type CheckAndSyncResult =
  | { ok: false }
  | {
      ok: true
      needsSync: boolean
      imported: number
      nowPlaying: NowPlayingTrack | null
    }

export async function checkAndSync(): Promise<CheckAndSyncResult> {
  const env = getFetcher()
  if (!env) return { ok: false }

  const { db, fetcher } = env
  const result = await syncScrobbles(db, fetcher)

  return {
    ok: true,
    needsSync: result.needsSync,
    imported: result.imported,
    nowPlaying: result.nowPlaying,
  }
}
