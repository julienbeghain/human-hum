import type { Database } from "../index"
import { recordListen, type ListenInput, type Source } from "../ingestion"
import { getHums, getStats } from "../queries"

// --- SourceFetcher interface ---

/** Track currently being listened to (no timestamp). */
export interface NowPlayingTrack {
  trackName: string
  artistName: string
  albumName?: string
}

/** Result of fetching a single page from a music source. */
export interface FetchPageResult {
  listens: ListenInput[]
  totalPages: number
  /** Entries skipped (e.g. "now playing" with no timestamp). */
  skippedCount: number
  /** Currently playing track, if any. */
  nowPlaying?: NowPlayingTrack
}

export interface FetchPageParams {
  page: number
  pageSize: number
  from?: Date
  to?: Date
}

/**
 * Source-agnostic interface for fetching hum pages from external services.
 * Implement this for each music source (LastFM, Spotify, Tidal, etc.).
 */
export interface SourceFetcher {
  readonly source: Source
  fetchPage(params: FetchPageParams): Promise<FetchPageResult>
  /** Return total play count from the remote source (for completeness checks). */
  getRemoteTotal?(): Promise<number>
}

// --- Orchestration types ---

export interface ImportOptions {
  from?: Date
  to?: Date
  /** Paginate through all pages (200 tracks/page). Default: single page of 50. */
  backfill?: boolean
  onProgress?: (progress: PageProgress) => void
}

export interface PageProgress {
  page: number
  totalPages: number
  imported: number
  skipped: number
}

export interface ImportResult {
  totalImported: number
  totalSkipped: number
  pagesProcessed: number
  completeness?: CompletenessResult
}

export interface CompletenessResult {
  localCount: number
  remoteTotal: number
  coveragePercent: number
}

// --- Sync probe types ---

export interface SyncProbeResult {
  needsSync: boolean
  /** Number of new tracks available from the source. */
  newPageCount: number
  nowPlaying: NowPlayingTrack | null
}

// --- Sync probe ---

/**
 * Lightweight check: are there new hums to import?
 *
 * Queries the latest local timestamp, then fetches one track from the source
 * with `from = latest - 1s`. The response's `totalPages` (at pageSize=1)
 * equals the number of new tracks. Also extracts now-playing info.
 */
export async function syncProbe(
  db: Database,
  fetcher: SourceFetcher
): Promise<SyncProbeResult> {
  const from = (await resolveSyncFrom(db)) ?? undefined

  const result = await fetcher.fetchPage({ page: 1, pageSize: 1, from })

  // When there's no local data, totalPages is the full history count
  const newPageCount = result.totalPages

  return {
    needsSync: result.listens.length > 0 || newPageCount > 1,
    newPageCount,
    nowPlaying: result.nowPlaying ?? null,
  }
}

// --- Sync entry point ---

export interface SyncOptions {
  onProgress?: (progress: PageProgress) => void
}

export interface SyncResult {
  needsSync: boolean
  nowPlaying: NowPlayingTrack | null
  imported: number
  skipped: number
  pagesProcessed: number
}

/**
 * Probe-then-import: checks for new hums and imports them if found.
 *
 * On empty DB, falls through to a full backfill. Returns now-playing info
 * regardless of whether new data was imported.
 */
export async function syncHums(
  db: Database,
  fetcher: SourceFetcher,
  options?: SyncOptions
): Promise<SyncResult> {
  const probe = await syncProbe(db, fetcher)

  if (!probe.needsSync) {
    return {
      needsSync: false,
      nowPlaying: probe.nowPlaying,
      imported: 0,
      skipped: 0,
      pagesProcessed: 0,
    }
  }

  const result = await importHums(db, fetcher, {
    onProgress: options?.onProgress,
  })

  return {
    needsSync: true,
    nowPlaying: probe.nowPlaying,
    imported: result.totalImported,
    skipped: result.totalSkipped,
    pagesProcessed: result.pagesProcessed,
  }
}

// --- Orchestration ---

const BASE_DELAY_MS = 200

/**
 * Source-agnostic hum import.
 *
 * - Default (no flags): incremental sync — fetches from MAX(listened_at)-1s,
 *   paginates through all new hums. Falls back to full backfill on empty DB.
 * - backfill=true: full backfill, paginates all pages (200/page, newest-first).
 */
export async function importHums(
  db: Database,
  fetcher: SourceFetcher,
  options: ImportOptions
): Promise<ImportResult> {
  const { onProgress } = options
  let { from, to } = options
  let backfill = options.backfill ?? false

  // Incremental sync: start just after the latest stored hum. An empty DB has
  // nothing to sync from, so fall back to a full backfill instead.
  if (!backfill && !from) {
    const syncFrom = await resolveSyncFrom(db)
    if (syncFrom) from = syncFrom
    else backfill = true
  }

  // Backfill resume: only fetch pages older than what we already have.
  if (backfill && !to) {
    to = await resolveBackfillTo(db)
  }

  // Backfill and incremental sync both paginate at 200/page.
  const pageSize = backfill || from ? 200 : 50

  let totalImported = 0
  let totalSkipped = 0
  let pagesProcessed = 0
  let currentPage = 1
  let totalPages = 1

  do {
    const result = await fetcher.fetchPage({
      page: currentPage,
      pageSize,
      from,
      to,
    })

    totalPages = result.totalPages
    const { imported, skipped } = await recordPage(db, result)

    totalImported += imported
    totalSkipped += skipped
    pagesProcessed++

    onProgress?.({ page: currentPage, totalPages, imported, skipped })

    currentPage++

    if (currentPage <= totalPages) {
      await delay(BASE_DELAY_MS)
    }
  } while (currentPage <= totalPages)

  // After backfill, check completeness against remote source
  let completeness: CompletenessResult | undefined
  if (backfill && fetcher.getRemoteTotal) {
    completeness = await checkCompleteness(db, fetcher)
  }

  return { totalImported, totalSkipped, pagesProcessed, completeness }
}

// --- Helpers ---

/**
 * Persist one fetched page's listens, tallying new imports vs. duplicates. The
 * page's pre-counted `skippedCount` (e.g. now-playing entries) seeds the skip
 * total; duplicates rejected by the unique constraint add to it.
 */
async function recordPage(
  db: Database,
  result: FetchPageResult
): Promise<{ imported: number; skipped: number }> {
  let imported = 0
  let skipped = result.skippedCount
  for (const listen of result.listens) {
    const recorded = await recordListen(db, listen)
    if (recorded.wasNew) imported++
    else skipped++
  }
  return { imported, skipped }
}

/**
 * Incremental-sync lower bound: 1 second before the latest stored hum (the
 * overlap is deduped by the unique constraint). Returns null on an empty DB,
 * signalling the caller to fall back to a full backfill.
 */
async function resolveSyncFrom(db: Database): Promise<Date | null> {
  const { rows } = await getHums(db, { pageSize: 1 })
  const latest = rows[0]
  return latest ? new Date(latest.listenedAt.getTime() - 1000) : null
}

/**
 * Backfill-resume upper bound: 1 second after the earliest stored hum, so we
 * only fetch pages older than what we already have. Returns undefined when the
 * DB is empty (nothing to resume past — fetch from the start).
 */
async function resolveBackfillTo(db: Database): Promise<Date | undefined> {
  const { rows } = await getHums(db, { pageSize: 1, orderAsc: true })
  const earliest = rows[0]
  return earliest ? new Date(earliest.listenedAt.getTime() + 1000) : undefined
}

async function checkCompleteness(
  db: Database,
  fetcher: SourceFetcher
): Promise<CompletenessResult> {
  const [stats, remoteTotal] = await Promise.all([
    getStats(db),
    fetcher.getRemoteTotal!(),
  ])
  const localCount = stats.total
  const coveragePercent =
    remoteTotal > 0
      ? Math.round((localCount / remoteTotal) * 10000) / 100
      : 100
  return { localCount, remoteTotal, coveragePercent }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
