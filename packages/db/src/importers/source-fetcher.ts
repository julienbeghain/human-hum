import type { Database } from "../index"
import { recordListen, type ListenInput, type Source } from "../ingestion"
import { getScrobbles, getStats } from "../queries"

// --- SourceFetcher interface ---

/** Result of fetching a single page from a music source. */
export interface FetchPageResult {
  listens: ListenInput[]
  totalPages: number
  /** Entries skipped (e.g. "now playing" with no timestamp). */
  skippedCount: number
}

export interface FetchPageParams {
  page: number
  pageSize: number
  from?: Date
  to?: Date
}

/**
 * Source-agnostic interface for fetching scrobble pages from external services.
 * Implement this for each music source (LastFM, Spotify, Tidal, etc.).
 */
export interface SourceFetcher {
  readonly source: Source
  fetchPage(params: FetchPageParams): Promise<FetchPageResult>
  /** Return total play count from the remote source (for completeness checks). */
  getRemotePlaycount?(): Promise<number>
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
  remotePlaycount: number
  coveragePercent: number
}

// --- Orchestration ---

const BASE_DELAY_MS = 200

/**
 * Source-agnostic scrobble import.
 *
 * - Default (no flags): incremental sync — fetches from MAX(listened_at)-1s,
 *   paginates through all new scrobbles. Falls back to full backfill on empty DB.
 * - backfill=true: full backfill, paginates all pages (200/page, newest-first).
 */
export async function importScrobbles(
  db: Database,
  fetcher: SourceFetcher,
  options: ImportOptions
): Promise<ImportResult> {
  const { backfill, onProgress } = options
  let { from, to } = options

  // Incremental sync: auto-detect `from` unless backfill or explicit `from`
  const paginate = backfill ?? false
  if (!backfill && !from) {
    const { rows } = await getScrobbles(db, { pageSize: 1 })
    const latest = rows[0]
    if (latest) {
      // 1-second overlap — dedup via unique constraint handles duplicates
      from = new Date(latest.listenedAt.getTime() - 1000)
    } else {
      // Empty DB — fall back to full backfill behavior
      return importScrobbles(db, fetcher, { ...options, backfill: true })
    }
  }

  // Backfill resume: if backfilling with existing data and no explicit `to`,
  // set to = MIN(listened_at) + 1s so we only fetch pages older than what we have
  if (backfill && !to) {
    const { rows: earliestRows } = await getScrobbles(db, {
      pageSize: 1,
      orderAsc: true,
    })
    const earliest = earliestRows[0]
    if (earliest) {
      to = new Date(earliest.listenedAt.getTime() + 1000)
    }
  }

  // Backfill and incremental sync both paginate at 200/page
  const pageSize = paginate || from ? 200 : 50

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
    let pageImported = 0
    let pageSkipped = result.skippedCount

    for (const listen of result.listens) {
      const recorded = await recordListen(db, listen)
      if (recorded.wasNew) pageImported++
      else pageSkipped++
    }

    totalImported += pageImported
    totalSkipped += pageSkipped
    pagesProcessed++

    onProgress?.({
      page: currentPage,
      totalPages,
      imported: pageImported,
      skipped: pageSkipped,
    })

    currentPage++

    if (currentPage <= totalPages) {
      await delay(BASE_DELAY_MS)
    }
  } while (currentPage <= totalPages)

  // After backfill, check completeness against remote source
  let completeness: CompletenessResult | undefined
  if (backfill && fetcher.getRemotePlaycount) {
    completeness = await checkCompleteness(db, fetcher)
  }

  return { totalImported, totalSkipped, pagesProcessed, completeness }
}

// --- Helpers ---

async function checkCompleteness(
  db: Database,
  fetcher: SourceFetcher
): Promise<CompletenessResult> {
  const [stats, remotePlaycount] = await Promise.all([
    getStats(db),
    fetcher.getRemotePlaycount!(),
  ])
  const localCount = stats.total
  const coveragePercent =
    remotePlaycount > 0
      ? Math.round((localCount / remotePlaycount) * 10000) / 100
      : 100
  return { localCount, remotePlaycount, coveragePercent }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
