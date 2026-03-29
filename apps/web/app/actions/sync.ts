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

export type ProbeResult =
  | { probed: false }
  | {
      probed: true
      needsSync: boolean
      newTrackCount: number
      nowPlaying: NowPlayingTrack | null
    }

export type SyncResult = {
  imported: number
}

export async function probeSync(): Promise<ProbeResult> {
  const env = getFetcher()
  if (!env) return { probed: false }

  const { db, fetcher } = env
  const probe: SyncProbeResult = await syncProbe(db, fetcher)

  return {
    probed: true,
    needsSync: probe.needsSync,
    newTrackCount: probe.newTrackCount,
    nowPlaying: probe.nowPlaying,
  }
}

export async function runSync(): Promise<SyncResult> {
  const env = getFetcher()
  if (!env) return { imported: 0 }

  const { db, fetcher } = env
  const result = await importScrobbles(db, fetcher, {})

  return { imported: result.totalImported }
}
