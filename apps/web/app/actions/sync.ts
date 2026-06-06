"use server"

import { createDb } from "@workspace/db"
import { LastfmFetcher, syncScrobbles } from "@workspace/db/importers/lastfm"
import type { NowPlayingTrack } from "@workspace/db/importers/lastfm"

import { env } from "@/env"

export interface CheckAndSyncResult {
  needsSync: boolean
  imported: number
  nowPlaying: NowPlayingTrack | null
}

export async function checkAndSync(): Promise<CheckAndSyncResult> {
  const db = createDb(env.DATABASE_URL)
  const fetcher = new LastfmFetcher(env.LASTFM_API_KEY, env.LASTFM_USER)
  const result = await syncScrobbles(db, fetcher)

  return {
    needsSync: result.needsSync,
    imported: result.imported,
    nowPlaying: result.nowPlaying,
  }
}
