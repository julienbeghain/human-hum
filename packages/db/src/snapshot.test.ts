import { describe, expect, it } from "vitest"

import {
  SNAPSHOT_VERSION,
  parse,
  serialize,
  type SnapshotRecord,
} from "./snapshot"

const records: SnapshotRecord[] = [
  {
    listenedAt: new Date("2024-01-15T20:30:00.000Z"),
    source: "lastfm",
    track: {
      name: "Paranoid Android",
      mbid: "9186052c-3ab3-4a64-84e5-0e0b3a3e8301",
    },
    album: {
      name: "OK Computer",
      mbid: "b0b45097-91e7-3731-86e1-3f3af4573a68",
    },
    artists: [
      {
        name: "Radiohead",
        mbid: "a74b1b7f-71a5-4011-9441-d0b5e4122711",
      },
    ],
  },
  {
    listenedAt: new Date("2024-02-10T18:00:00.000Z"),
    source: "spotify",
    track: { name: "Archangel" },
    artists: [{ name: "Burial" }],
  },
  {
    listenedAt: new Date("2024-03-01T12:00:00.000Z"),
    source: "tidal",
    track: { name: "Smile" },
    album: { name: "The Boy with the Arab Strap" },
    artists: [
      { name: "Belle and Sebastian" },
      { name: "Isobel Campbell", mbid: "0fa56f4f-9469-4e3c-a4e3-49b9d5c9d2f0" },
    ],
  },
]

describe("snapshot codec", () => {
  const exportedAt = new Date("2026-06-28T10:00:00.000Z")

  it("round-trips records through serialize then parse", () => {
    const parsed = parse(serialize(records, exportedAt))

    expect(parsed.records).toEqual(records)
  })

  it("emits a versioned header with version, exportedAt, and count", () => {
    const parsed = parse(serialize(records, exportedAt))

    expect(parsed.header.snapshotVersion).toBe(SNAPSHOT_VERSION)
    expect(parsed.header.exportedAt).toEqual(exportedAt)
    expect(parsed.header.count).toBe(records.length)
  })

  it("serializes as JSONL: a header line followed by one line per record", () => {
    const jsonl = serialize(records, exportedAt)
    const lines = jsonl.split("\n").filter((l) => l.length > 0)

    expect(lines).toHaveLength(records.length + 1)

    const header = JSON.parse(lines[0]!)
    expect(header).toEqual({
      snapshotVersion: SNAPSHOT_VERSION,
      exportedAt: exportedAt.toISOString(),
      count: records.length,
    })
  })

  it("serializes dates as ISO-8601 strings and parses them back to Date", () => {
    const jsonl = serialize(records, exportedAt)
    const firstRecordLine = JSON.parse(jsonl.split("\n")[1]!)

    expect(firstRecordLine.listenedAt).toBe("2024-01-15T20:30:00.000Z")

    const parsed = parse(jsonl)
    expect(parsed.records[0]!.listenedAt).toBeInstanceOf(Date)
    expect(parsed.records[0]!.listenedAt).toEqual(records[0]!.listenedAt)
  })

  it("round-trips an empty record set, preserving a zero count", () => {
    const parsed = parse(serialize([], exportedAt))

    expect(parsed.records).toEqual([])
    expect(parsed.header.count).toBe(0)
  })
})
