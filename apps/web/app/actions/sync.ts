"use server"

import { createDb } from "@workspace/db"
import {
  LastfmFetcher,
  syncProbe,
  syncScrobbles,
} from "@workspace/db/importers/lastfm"
import type { NowPlayingTrack, SyncProbeResult } from "@workspace/db/importers/lastfm"

function getEnv(name: string): string | undefined {
  return process.env[name]
}

function getFetcher(): { db: ReturnType<typeof createDb>; fetcher: LastfmFetcher } | null {
  const apiKey = getEnv("LASTFM_API_KEY")
  const user = getEnv("LASTFM_USER")
  const databaseUrl = getEnv("DATABASE_URL")

  if (!apiKey || !user || !databaseUrl) return null

  return {
    db: createDb(databaseUrl),
    fetcher: new LastfmFetcher(apiKey, user),
  }
}

export type ProbeResult =
  | { probed: false }
  | {
      probed: true
      needsSync: boolean
      newPageCount: number
      nowPlaying: NowPlayingTrack | null
    }

export type SyncResult = {
  imported: number
  nowPlaying: NowPlayingTrack | null
}

export async function probeSync(): Promise<ProbeResult> {
  const env = getFetcher()
  if (!env) return { probed: false }

  const { db, fetcher } = env
  const probe: SyncProbeResult = await syncProbe(db, fetcher)

  return {
    probed: true,
    needsSync: probe.needsSync,
    newPageCount: probe.newPageCount,
    nowPlaying: probe.nowPlaying,
  }
}

export async function runSync(): Promise<SyncResult> {
  const env = getFetcher()
  if (!env) return { imported: 0, nowPlaying: null }

  const { db, fetcher } = env
  const result = await syncScrobbles(db, fetcher)

  return { imported: result.imported, nowPlaying: result.nowPlaying }
}
