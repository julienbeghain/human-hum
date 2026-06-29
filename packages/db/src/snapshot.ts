import type { Source } from "./ingestion"
import * as schema from "./schema"

export const SNAPSHOT_VERSION = 1

const VALID_SOURCES = new Set<string>(schema.sourceEnum.enumValues)

export interface SnapshotEntityRef {
  name: string
  mbid?: string
}

/**
 * Source-reported ground truth for one hum, decoupled from `ListenInput` and
 * the current schema. `artists` is ordered — first is the primary credit —
 * making the format forward-compatible with many-to-many artist credit even
 * though Last.fm reports a single artist today.
 */
export interface SnapshotRecord {
  listenedAt: Date
  source: Source
  track: SnapshotEntityRef
  album?: SnapshotEntityRef
  artists: SnapshotEntityRef[]
}

export interface SnapshotHeader {
  snapshotVersion: number
  exportedAt: Date
  count: number
}

export interface ParsedSnapshot {
  header: SnapshotHeader
  records: SnapshotRecord[]
}

interface WireHeader {
  snapshotVersion: number
  exportedAt: string
  count: number
}

interface WireRecord {
  listenedAt: string
  source: Source
  track: SnapshotEntityRef
  album?: SnapshotEntityRef
  artists: SnapshotEntityRef[]
}

export function serialize(records: SnapshotRecord[], exportedAt: Date): string {
  const header: WireHeader = {
    snapshotVersion: SNAPSHOT_VERSION,
    exportedAt: exportedAt.toISOString(),
    count: records.length,
  }

  const lines = [JSON.stringify(header)]
  for (const record of records) {
    const wire: WireRecord = {
      listenedAt: record.listenedAt.toISOString(),
      source: record.source,
      track: record.track,
      ...(record.album ? { album: record.album } : {}),
      artists: record.artists,
    }
    lines.push(JSON.stringify(wire))
  }

  return lines.join("\n") + "\n"
}

export function parse(jsonl: string): ParsedSnapshot {
  const lines = jsonl.split("\n").filter((line) => line.trim().length > 0)
  if (lines.length === 0) {
    throw new Error("Snapshot is empty: missing header line")
  }

  const header = JSON.parse(lines[0]!) as WireHeader

  if (header.snapshotVersion !== SNAPSHOT_VERSION) {
    throw new Error(
      `Unsupported snapshot version: expected ${SNAPSHOT_VERSION}, got ${header.snapshotVersion}`
    )
  }

  const records = lines.slice(1).map((line) => {
    const wire = JSON.parse(line) as WireRecord
    if (!VALID_SOURCES.has(wire.source)) {
      throw new Error(`Invalid source in snapshot record: "${wire.source}"`)
    }
    const record: SnapshotRecord = {
      listenedAt: new Date(wire.listenedAt),
      source: wire.source,
      track: wire.track,
      ...(wire.album ? { album: wire.album } : {}),
      artists: wire.artists,
    }
    return record
  })

  if (records.length !== header.count) {
    throw new Error(
      `Snapshot record count mismatch: header says ${header.count}, found ${records.length}`
    )
  }

  return {
    header: {
      snapshotVersion: header.snapshotVersion,
      exportedAt: new Date(header.exportedAt),
      count: header.count,
    },
    records,
  }
}
