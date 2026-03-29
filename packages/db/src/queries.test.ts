import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.setConfig({ hookTimeout: 30_000 });

import type { Database } from "./index";
import { recordListen } from "./ingestion";
import {
  getAlbumDetail,
  getArtistDetail,
  getArtistRankings,
  getListeningClock,
  getScrobbles,
  getStats,
  getTimeSeries,
} from "./queries";
import * as schema from "./schema";

let client: PGlite;
let db: Database;

// Known IDs populated during seed — avoids chaining queries to discover them
let aphexTwinId: number;
let boardsOfCanadaId: number;
let autechreId: number;
let mhtrtcAlbumId: number;
let drukqsAlbumId: number;

beforeAll(async () => {
  client = new PGlite();

  await client.exec(`CREATE SCHEMA IF NOT EXISTS "listen"`);
  await client.exec(`
    CREATE TYPE "listen"."source" AS ENUM ('lastfm', 'spotify', 'tidal');

    CREATE TABLE "listen"."artists" (
      "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      "name" text NOT NULL,
      "mbid" varchar(36),
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "deleted_at" timestamp with time zone
    );
    CREATE UNIQUE INDEX "artists_name_idx" ON "listen"."artists" ("name");

    CREATE TABLE "listen"."albums" (
      "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      "name" text NOT NULL,
      "mbid" varchar(36),
      "artist_id" integer NOT NULL REFERENCES "listen"."artists"("id"),
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "deleted_at" timestamp with time zone
    );
    CREATE UNIQUE INDEX "albums_name_artist_id_idx" ON "listen"."albums" ("name", "artist_id");

    CREATE TABLE "listen"."tracks" (
      "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      "name" text NOT NULL,
      "mbid" varchar(36),
      "artist_id" integer NOT NULL REFERENCES "listen"."artists"("id"),
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "deleted_at" timestamp with time zone
    );
    CREATE UNIQUE INDEX "tracks_name_artist_id_idx" ON "listen"."tracks" ("name", "artist_id");

    CREATE TABLE "listen"."scrobbles" (
      "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      "track_id" integer NOT NULL REFERENCES "listen"."tracks"("id"),
      "album_id" integer REFERENCES "listen"."albums"("id"),
      "listened_at" timestamp with time zone NOT NULL,
      "source" "listen"."source" NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "deleted_at" timestamp with time zone
    );
    CREATE UNIQUE INDEX "scrobbles_track_id_listened_at_idx" ON "listen"."scrobbles" ("track_id", "listened_at");
  `);

  db = drizzle({ client, schema }) as unknown as Database;

  // Seed data — capture entity IDs for direct use in tests
  //
  // Timeline:
  //   2020-01-01T00:00 Autechre  - Clipper                          (spotify, hour 0)
  //   2024-05-01T10:00 BoC       - Roygbiv  [MHTRTC]               (lastfm,  hour 10)
  //   2024-05-01T11:00 BoC       - Aquarius [MHTRTC]               (lastfm,  hour 11)
  //   2025-12-31T23:59 Autechre  - Bike                            (spotify, hour 23)
  //   2026-01-15T20:00 Aphex Twin - Windowlicker                   (lastfm,  hour 20)
  //   2026-03-01T12:00 Aphex Twin - Vordhosbn [Drukqs]             (lastfm,  hour 12)

  const r1 = await recordListen(db, {
    artist: { name: "Aphex Twin" },
    track: { name: "Windowlicker" },
    listenedAt: new Date("2026-01-15T20:00:00Z"),
    source: "lastfm",
  });
  aphexTwinId = r1.artistId;

  const r2 = await recordListen(db, {
    artist: { name: "Aphex Twin" },
    track: { name: "Vordhosbn" },
    album: { name: "Drukqs" },
    listenedAt: new Date("2026-03-01T12:00:00Z"),
    source: "lastfm",
  });
  drukqsAlbumId = r2.albumId!;

  const r3 = await recordListen(db, {
    artist: { name: "Boards of Canada" },
    track: { name: "Roygbiv" },
    album: { name: "Music Has the Right to Children" },
    listenedAt: new Date("2024-05-01T10:00:00Z"),
    source: "lastfm",
  });
  boardsOfCanadaId = r3.artistId;
  mhtrtcAlbumId = r3.albumId!;

  await recordListen(db, {
    artist: { name: "Boards of Canada" },
    track: { name: "Aquarius" },
    album: { name: "Music Has the Right to Children" },
    listenedAt: new Date("2024-05-01T11:00:00Z"),
    source: "lastfm",
  });

  const r5 = await recordListen(db, {
    artist: { name: "Autechre" },
    track: { name: "Clipper" },
    listenedAt: new Date("2020-01-01T00:00:00Z"),
    source: "spotify",
  });
  autechreId = r5.artistId;

  await recordListen(db, {
    artist: { name: "Autechre" },
    track: { name: "Bike" },
    listenedAt: new Date("2025-12-31T23:59:00Z"),
    source: "spotify",
  });
});

afterAll(async () => {
  await client.close();
});

// --- getScrobbles ---

describe("getScrobbles", () => {
  it("returns scrobbles with track and artist names", async () => {
    const { rows } = await getScrobbles(db);
    expect(rows.length).toBe(6);

    const row = rows.find((r) => r.trackName === "Roygbiv");
    expect(row).toBeDefined();
    expect(row!.artistName).toBe("Boards of Canada");
    expect(row!.albumName).toBe("Music Has the Right to Children");
    expect(row!.source).toBe("lastfm");
    expect(row!.listenedAt).toBeInstanceOf(Date);
  });

  it("returns null albumName when scrobble has no album", async () => {
    const { rows } = await getScrobbles(db);
    const row = rows.find((r) => r.trackName === "Windowlicker");
    expect(row).toBeDefined();
    expect(row!.albumName).toBeNull();
  });

  it("orders by listenedAt descending by default", async () => {
    const { rows } = await getScrobbles(db);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.listenedAt.getTime()).toBeGreaterThanOrEqual(
        rows[i]!.listenedAt.getTime(),
      );
    }
  });

  it("orders ascending when orderAsc is true", async () => {
    const { rows } = await getScrobbles(db, { orderAsc: true });
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.listenedAt.getTime()).toBeLessThanOrEqual(
        rows[i]!.listenedAt.getTime(),
      );
    }
  });

  it("supports cursor-based pagination", async () => {
    const first = await getScrobbles(db, { pageSize: 2 });
    expect(first.rows.length).toBe(2);

    const next = await getScrobbles(db, {
      pageSize: 2,
      cursor: first.rows[1]!.listenedAt,
    });
    expect(next.rows.length).toBeGreaterThan(0);
    for (const row of next.rows) {
      expect(row.listenedAt.getTime()).toBeLessThan(
        first.rows[1]!.listenedAt.getTime(),
      );
    }
  });

  it("filters by time range (from and to)", async () => {
    const from = new Date("2025-01-01T00:00:00Z");
    const to = new Date("2026-01-31T23:59:59Z");
    const { rows } = await getScrobbles(db, { from, to });

    expect(rows.length).toBe(2); // Autechre Bike + Aphex Twin Windowlicker
    for (const row of rows) {
      expect(row.listenedAt.getTime()).toBeGreaterThanOrEqual(from.getTime());
      expect(row.listenedAt.getTime()).toBeLessThanOrEqual(to.getTime());
    }
  });

  it("filters by source", async () => {
    const { rows } = await getScrobbles(db, { source: "spotify" });
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.source).toBe("spotify");
    }
  });

  // --- Offset pagination ---

  it("returns totalCount alongside rows", async () => {
    const result = await getScrobbles(db);
    expect(result.totalCount).toBe(6);
    expect(result.rows.length).toBe(6);
  });

  it("paginates with page and pageSize", async () => {
    const page1 = await getScrobbles(db, { page: 1, pageSize: 2 });
    expect(page1.rows.length).toBe(2);
    expect(page1.totalCount).toBe(6);

    const page2 = await getScrobbles(db, { page: 2, pageSize: 2 });
    expect(page2.rows.length).toBe(2);
    expect(page2.totalCount).toBe(6);

    // Pages should have different rows
    const page1Ids = page1.rows.map((r) => r.id);
    const page2Ids = page2.rows.map((r) => r.id);
    expect(page1Ids).not.toEqual(page2Ids);
  });

  it("returns empty rows for page beyond data", async () => {
    const result = await getScrobbles(db, { page: 100, pageSize: 50 });
    expect(result.rows.length).toBe(0);
    expect(result.totalCount).toBe(6);
  });

  it("totalCount respects filters", async () => {
    const result = await getScrobbles(db, {
      source: "spotify",
      page: 1,
      pageSize: 10,
    });
    expect(result.totalCount).toBe(2);
    expect(result.rows.length).toBe(2);
  });
});

// --- getStats ---

describe("getStats", () => {
  it("returns aggregate statistics", async () => {
    const stats = await getStats(db);
    expect(stats.total).toBe(6);
    expect(stats.earliest).toBeInstanceOf(Date);
    expect(stats.latest).toBeInstanceOf(Date);
    expect(stats.earliest!.getTime()).toBe(
      new Date("2020-01-01T00:00:00Z").getTime(),
    );
    expect(stats.latest!.getTime()).toBe(
      new Date("2026-03-01T12:00:00Z").getTime(),
    );
    expect(stats.uniqueArtists).toBe(3);
    expect(stats.uniqueTracks).toBe(6);
    expect(stats.uniqueAlbums).toBe(2); // Drukqs + MHTRTC
  });

  it("filters stats by time range", async () => {
    const stats = await getStats(db, {
      from: new Date("2026-01-01T00:00:00Z"),
    });
    expect(stats.total).toBe(2);
    expect(stats.uniqueArtists).toBe(1);
  });
});

// --- getArtistRankings ---

describe("getArtistRankings", () => {
  it("ranks artists by play count descending", async () => {
    const rankings = await getArtistRankings(db);
    expect(rankings.length).toBe(3);
    // All artists have 2 plays — verify ordering is stable (descending)
    for (let i = 1; i < rankings.length; i++) {
      expect(rankings[i - 1]!.playCount).toBeGreaterThanOrEqual(
        rankings[i]!.playCount,
      );
    }
    expect(rankings[0]!.artistName).toBeTruthy();
    expect(rankings[0]!.artistId).toBeGreaterThan(0);
  });

  it("respects topN", async () => {
    const rankings = await getArtistRankings(db, { topN: 1 });
    expect(rankings.length).toBe(1);
  });

  it("filters by time range", async () => {
    const rankings = await getArtistRankings(db, {
      from: new Date("2026-01-01T00:00:00Z"),
    });
    expect(rankings.length).toBe(1);
    expect(rankings[0]!.artistName).toBe("Aphex Twin");
  });
});

// --- getArtistDetail ---

describe("getArtistDetail", () => {
  it("returns artist info with top tracks and albums", async () => {
    const detail = await getArtistDetail(db, { artistId: boardsOfCanadaId });
    expect(detail).not.toBeNull();
    expect(detail!.artistName).toBe("Boards of Canada");
    expect(detail!.playCount).toBe(2);
    expect(detail!.topTracks.length).toBe(2);
    expect(detail!.topAlbums.length).toBe(1);
    expect(detail!.topAlbums[0]!.albumName).toBe(
      "Music Has the Right to Children",
    );
  });

  it("returns null for non-existent artist", async () => {
    const detail = await getArtistDetail(db, { artistId: 99999 });
    expect(detail).toBeNull();
  });
});

// --- getAlbumDetail ---

describe("getAlbumDetail", () => {
  it("returns album info with track listing", async () => {
    const album = await getAlbumDetail(db, { albumId: mhtrtcAlbumId });
    expect(album).not.toBeNull();
    expect(album!.albumName).toBe("Music Has the Right to Children");
    expect(album!.artistName).toBe("Boards of Canada");
    expect(album!.playCount).toBe(2);
    expect(album!.tracks.length).toBe(2);
  });

  it("returns null for non-existent album", async () => {
    const album = await getAlbumDetail(db, { albumId: 99999 });
    expect(album).toBeNull();
  });
});

// --- getTimeSeries ---

describe("getTimeSeries", () => {
  it("buckets scrobbles by month", async () => {
    const series = await getTimeSeries(db, { period: "month" });
    expect(series.length).toBeGreaterThan(0);
    for (const bucket of series) {
      expect(bucket.period).toBeInstanceOf(Date);
      expect(bucket.count).toBeGreaterThan(0);
    }
  });

  it("buckets scrobbles by year", async () => {
    const series = await getTimeSeries(db, { period: "year" });
    // 2020, 2024, 2025, 2026
    expect(series.length).toBe(4);
    const totalCount = series.reduce((sum, b) => sum + b.count, 0);
    expect(totalCount).toBe(6);
  });

  it("respects time-range filter", async () => {
    const series = await getTimeSeries(db, {
      period: "month",
      from: new Date("2026-01-01T00:00:00Z"),
    });
    for (const bucket of series) {
      expect(bucket.period.getFullYear()).toBe(2026);
    }
  });
});

// --- getListeningClock ---

describe("getListeningClock", () => {
  it("returns 24 slots", async () => {
    const clock = await getListeningClock(db);
    expect(clock.length).toBe(24);
    expect(clock[0]!.hour).toBe(0);
    expect(clock[23]!.hour).toBe(23);
  });

  it("counts scrobbles per hour", async () => {
    const clock = await getListeningClock(db);
    const totalCount = clock.reduce((sum, s) => sum + s.count, 0);
    expect(totalCount).toBe(6);
  });

  it("populates exactly the hours with scrobbles", async () => {
    // Seed hours: 0 (Clipper), 10 (Roygbiv), 11 (Aquarius), 12 (Vordhosbn), 20 (Windowlicker), 23 (Bike)
    const clock = await getListeningClock(db);
    const populated = clock.filter((s) => s.count > 0);
    expect(populated.length).toBe(6);

    const populatedHours = populated.map((s) => s.hour).sort((a, b) => a - b);
    expect(populatedHours).toEqual([0, 10, 11, 12, 20, 23]);

    const zeroHours = clock.filter((s) => s.count === 0);
    expect(zeroHours.length).toBe(18);
  });
});
