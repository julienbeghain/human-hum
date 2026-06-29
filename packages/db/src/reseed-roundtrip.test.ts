import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.setConfig({ hookTimeout: 30_000 })

import type { Database } from "./index"
import {
  bulkIngest,
  listenInputFromSnapshot,
  recordListen,
  type ListenInput,
} from "./ingestion"
import { exportHums } from "./queries"
import { parse, serialize, type SnapshotRecord } from "./snapshot"
import { setupTestDb } from "./test-utils"

let sourceClient: PGlite
let reseedClient: PGlite
let sourceDb: Database
let reseedDb: Database

beforeEach(async () => {
  ;({ db: sourceDb, client: sourceClient } = await setupTestDb())
  ;({ db: reseedDb, client: reseedClient } = await setupTestDb())
})

afterEach(async () => {
  await sourceClient.close()
  await reseedClient.close()
})

function sortKey(r: SnapshotRecord): string {
  return `${r.listenedAt.toISOString()} ${r.track.name}`
}

describe("listenInputFromSnapshot", () => {
  it("maps a record to a single-artist ListenInput by taking artists[0]", () => {
    const record: SnapshotRecord = {
      listenedAt: new Date("2024-01-15T20:30:00.000Z"),
      source: "lastfm",
      track: { name: "Paranoid Android", mbid: "track-mbid" },
      album: { name: "OK Computer", mbid: "album-mbid" },
      artists: [
        { name: "Radiohead", mbid: "primary-mbid" },
        { name: "Some Feature", mbid: "secondary-mbid" },
      ],
    }

    const input = listenInputFromSnapshot(record)

    expect(input).toEqual<ListenInput>({
      listenedAt: new Date("2024-01-15T20:30:00.000Z"),
      source: "lastfm",
      track: { name: "Paranoid Android", mbid: "track-mbid" },
      album: { name: "OK Computer", mbid: "album-mbid" },
      artist: { name: "Radiohead", mbid: "primary-mbid" },
    })
  })

  it("omits album when the record has none", () => {
    const record: SnapshotRecord = {
      listenedAt: new Date("2024-02-10T18:00:00.000Z"),
      source: "spotify",
      track: { name: "Archangel" },
      artists: [{ name: "Burial" }],
    }

    const input = listenInputFromSnapshot(record)

    expect(input.album).toBeUndefined()
    expect(input.artist).toEqual({ name: "Burial" })
  })
})

describe("reseed round-trip", () => {
  it("reproduces the exported hum set in a fresh database", async () => {
    const listens: ListenInput[] = [
      {
        artist: {
          name: "Radiohead",
          mbid: "a74b1b7f-71a5-4011-9441-d0b5e4122711",
        },
        album: {
          name: "OK Computer",
          mbid: "b0b45097-91e7-3731-86e1-3f3af4573a68",
        },
        track: {
          name: "Paranoid Android",
          mbid: "9186052c-3ab3-4a64-84e5-0e0b3a3e8301",
        },
        listenedAt: new Date("2024-01-15T20:30:00.000Z"),
        source: "lastfm",
      },
      {
        artist: { name: "Burial" },
        track: { name: "Archangel" },
        listenedAt: new Date("2024-02-10T18:00:00.000Z"),
        source: "spotify",
      },
      {
        artist: { name: "Aphex Twin" },
        album: { name: "Selected Ambient Works 85-92" },
        track: { name: "Xtal" },
        listenedAt: new Date("2024-03-01T12:00:00.000Z"),
        source: "tidal",
      },
      {
        artist: { name: "Aphex Twin" },
        album: { name: "Selected Ambient Works 85-92" },
        track: { name: "Ageispolis" },
        listenedAt: new Date("2024-03-01T12:05:00.000Z"),
        source: "tidal",
      },
    ]

    for (const listen of listens) {
      await recordListen(sourceDb, listen)
    }

    // populate -> export -> serialize -> parse
    const exported = await exportHums(sourceDb)
    const jsonl = serialize(exported, new Date("2026-06-28T00:00:00.000Z"))
    const { records } = parse(jsonl)

    // parse -> bulkIngest into a fresh DB
    const inputs = records.map(listenInputFromSnapshot)
    const first = await bulkIngest(reseedDb, inputs)
    expect(first.insertedHums).toBe(listens.length)

    const reseeded = await exportHums(reseedDb)

    const normalize = (rs: SnapshotRecord[]) =>
      [...rs].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))

    expect(normalize(reseeded)).toEqual(normalize(exported))

    // second reseed inserts zero
    const second = await bulkIngest(reseedDb, inputs)
    expect(second.insertedHums).toBe(0)
  })
})
