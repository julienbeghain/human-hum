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

  // Seed data for all tests
  await recordListen(db, {
    artist: { name: "Aphex Twin" },
    track: { name: "Windowlicker" },
    listenedAt: new Date("2026-01-15T20:00:00Z"),
    source: "lastfm",
  });
  await recordListen(db, {
    artist: { name: "Aphex Twin" },
    track: { name: "Vordhosbn" },
    album: { name: "Drukqs" },
    listenedAt: new Date("2026-03-01T12:00:00Z"),
    source: "lastfm",
  });
  await recordListen(db, {
    artist: { name: "Boards of Canada" },
    track: { name: "Roygbiv" },
    album: { name: "Music Has the Right to Children" },
    listenedAt: new Date("2024-05-01T10:00:00Z"),
    source: "lastfm",
  });
  await recordListen(db, {
    artist: { name: "Boards of Canada" },
    track: { name: "Aquarius" },
    album: { name: "Music Has the Right to Children" },
    listenedAt: new Date("2024-05-01T11:00:00Z"),
    source: "lastfm",
  });
  await recordListen(db, {
    artist: { name: "Autechre" },
    track: { name: "Clipper" },
    listenedAt: new Date("2020-01-01T00:00:00Z"),
    source: "spotify",
  });
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
    const rows = await getScrobbles(db);
    expect(rows.length).toBeGreaterThan(0);

    const row = rows.find((r) => r.trackName === "Roygbiv");
    expect(row).toBeDefined();
    expect(row!.artistName).toBe("Boards of Canada");
    expect(row!.albumName).toBe("Music Has the Right to Children");
    expect(row!.source).toBe("lastfm");
    expect(row!.listenedAt).toBeInstanceOf(Date);
  });

  it("returns null albumName when scrobble has no album", async () => {
    const rows = await getScrobbles(db);
    const row = rows.find((r) => r.trackName === "Windowlicker");
    expect(row).toBeDefined();
    expect(row!.albumName).toBeNull();
  });

  it("orders by listenedAt descending by default", async () => {
    const rows = await getScrobbles(db);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.listenedAt.getTime()).toBeGreaterThanOrEqual(
        rows[i]!.listenedAt.getTime(),
      );
    }
  });

  it("orders ascending when orderAsc is true", async () => {
    const rows = await getScrobbles(db, { orderAsc: true });
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.listenedAt.getTime()).toBeLessThanOrEqual(
        rows[i]!.listenedAt.getTime(),
      );
    }
  });

  it("respects the limit option", async () => {
    const rows = await getScrobbles(db, { limit: 2 });
    expect(rows.length).toBe(2);
  });

  it("supports cursor-based pagination", async () => {
    const first = await getScrobbles(db, { limit: 2 });
    expect(first.length).toBe(2);

    const next = await getScrobbles(db, {
      limit: 2,
      cursor: first[1]!.listenedAt,
    });
    expect(next.length).toBeGreaterThan(0);
    // All results should be older than the cursor
    for (const row of next) {
      expect(row.listenedAt.getTime()).toBeLessThan(
        first[1]!.listenedAt.getTime(),
      );
    }
  });

  it("filters by time range", async () => {
    const rows = await getScrobbles(db, {
      from: new Date("2025-01-01T00:00:00Z"),
      to: new Date("2026-12-31T23:59:59Z"),
    });
    for (const row of rows) {
      expect(row.listenedAt.getTime()).toBeGreaterThanOrEqual(
        new Date("2025-01-01T00:00:00Z").getTime(),
      );
    }
  });

  it("filters by source", async () => {
    const rows = await getScrobbles(db, { source: "spotify" });
    for (const row of rows) {
      expect(row.source).toBe("spotify");
    }
    expect(rows.length).toBe(2);
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
    expect(stats.uniqueAlbums).toBeGreaterThanOrEqual(1);
  });

  it("filters stats by time range", async () => {
    const stats = await getStats(db, {
      from: new Date("2026-01-01T00:00:00Z"),
    });
    expect(stats.total).toBe(2); // Aphex Twin tracks in 2026
    expect(stats.uniqueArtists).toBe(1);
  });
});

// --- getArtistRankings ---

describe("getArtistRankings", () => {
  it("ranks artists by play count descending", async () => {
    const rankings = await getArtistRankings(db);
    expect(rankings.length).toBe(3);
    // Each artist has 2 scrobbles, so order may vary — just check structure
    expect(rankings[0]!.playCount).toBeGreaterThanOrEqual(
      rankings[1]!.playCount,
    );
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
    // Find Boards of Canada's ID via rankings
    const rankings = await getArtistRankings(db);
    const boc = rankings.find((r) => r.artistName === "Boards of Canada");
    expect(boc).toBeDefined();

    const detail = await getArtistDetail(db, { artistId: boc!.artistId });
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
    // Find the album ID via artist detail
    const rankings = await getArtistRankings(db);
    const boc = rankings.find((r) => r.artistName === "Boards of Canada");
    const detail = await getArtistDetail(db, { artistId: boc!.artistId });
    const albumId = detail!.topAlbums[0]!.albumId;

    const album = await getAlbumDetail(db, { albumId });
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
    // We have scrobbles in 2020, 2024, 2025, 2026
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

  it("fills missing hours with zero", async () => {
    const clock = await getListeningClock(db);
    // Most hours should be 0
    const zeroHours = clock.filter((s) => s.count === 0);
    expect(zeroHours.length).toBeGreaterThanOrEqual(18);
  });
});
