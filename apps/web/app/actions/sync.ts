"use server"

import { createDb } from "@workspace/db"
import {
  importScrobbles,
  LastfmFetcher,
  syncProbe,
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

export type SyncResult = {
  probed: false
} | {
  probed: true
  needsSync: boolean
  imported: number
  nowPlaying: NowPlayingTrack | null
}

export async function silentSync(): Promise<SyncResult> {
  const env = getFetcher()
  if (!env) return { probed: false }

  const { db, fetcher } = env

  const probe: SyncProbeResult = await syncProbe(db, fetcher)

  if (!probe.needsSync) {
    return { probed: true, needsSync: false, imported: 0, nowPlaying: probe.nowPlaying }
  }

  // Run incremental import (no backfill flag = sync from latest)
  const result = await importScrobbles(db, fetcher, {})

  return {
    probed: true,
    needsSync: true,
    imported: result.totalImported,
    nowPlaying: probe.nowPlaying,
  }
}
