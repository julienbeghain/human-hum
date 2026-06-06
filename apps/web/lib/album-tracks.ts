export type SortMode = "album-order" | "scrobble-count-descending"

export interface TrackRow {
  key: string | number
  trackNumber: number | null
  trackName: string
  scrobbleCount: number
  duration: number | null
}

export function sortTracks(rows: TrackRow[], mode: SortMode): TrackRow[] {
  const sorted = [...rows]
  if (mode === "scrobble-count-descending") {
    sorted.sort((a, b) => b.scrobbleCount - a.scrobbleCount)
  } else {
    // album-order: track number ascending; null track numbers sink to the end
    // while preserving their original relative order (un-enriched albums).
    sorted.sort(
      (a, b) =>
        (a.trackNumber ?? Number.POSITIVE_INFINITY) -
        (b.trackNumber ?? Number.POSITIVE_INFINITY)
    )
  }
  return sorted
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return "—"
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${remainder.toString().padStart(2, "0")}`
}
