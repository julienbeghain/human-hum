import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.setConfig({ hookTimeout: 30_000 })

import type { Database } from "./index"
import { recordListen } from "./ingestion"
import { exportHums } from "./queries"
import * as schema from "./schema"
import type { SnapshotRecord } from "./snapshot"
import { setupTestDb } from "./test-utils"

let client: PGlite
let db: Database
let deletedHumId: number

beforeAll(async () => {
  ;({ db, client } = await setupTestDb())

  await recordListen(db, {
    artist: { name: "Radiohead", mbid: "a74b1b7f-71a5-4011-9441-d0b5e4122711" },
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
  })

  // No mbids, no album — bare ground truth.
  await recordListen(db, {
    artist: { name: "Burial" },
    track: { name: "Archangel" },
    listenedAt: new Date("2024-02-10T18:00:00.000Z"),
    source: "spotify",
  })

  await recordListen(db, {
    artist: { name: "Aphex Twin" },
    album: { name: "Selected Ambient Works 85-92" },
    track: { name: "Xtal" },
    listenedAt: new Date("2024-03-01T12:00:00.000Z"),
    source: "tidal",
  })

  const deleted = await recordListen(db, {
    artist: { name: "Boards of Canada" },
    track: { name: "Roygbiv" },
    listenedAt: new Date("2024-04-01T09:00:00.000Z"),
    source: "lastfm",
  })
  deletedHumId = deleted.humId

  await db
    .update(schema.hums)
    .set({ deletedAt: new Date("2024-04-02T00:00:00.000Z") })
    .where(eq(schema.hums.id, deletedHumId))
})

afterAll(async () => {
  await client.close()
})

describe("exportHums", () => {
  it("returns every non-deleted hum with mbids, source, and ordered artists", async () => {
    const records = await exportHums(db)

    const expected: SnapshotRecord[] = [
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
          { name: "Radiohead", mbid: "a74b1b7f-71a5-4011-9441-d0b5e4122711" },
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
        track: { name: "Xtal" },
        album: { name: "Selected Ambient Works 85-92" },
        artists: [{ name: "Aphex Twin" }],
      },
    ]

    expect(records).toEqual(expected)
  })

  it("excludes soft-deleted hums", async () => {
    const records = await exportHums(db)

    expect(records.map((r) => r.track.name)).not.toContain("Roygbiv")
  })

  it("returns the complete set across multiple cursor batches", async () => {
    const records = await exportHums(db, { batchSize: 1 })

    expect(records).toHaveLength(3)
    expect(records.map((r) => r.listenedAt)).toEqual([
      new Date("2024-01-15T20:30:00.000Z"),
      new Date("2024-02-10T18:00:00.000Z"),
      new Date("2024-03-01T12:00:00.000Z"),
    ])
  })
})
