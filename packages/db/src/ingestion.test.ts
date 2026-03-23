import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.setConfig({ hookTimeout: 30_000 });

import type { Database } from "./index.js";
import { recordListen } from "./ingestion.js";
import * as schema from "./schema.js";

let client: PGlite;
let db: Database;

beforeAll(async () => {
  client = new PGlite();

  // Create the "listen" schema and all tables
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
    CREATE UNIQUE INDEX "artists_name_mbid_idx" ON "listen"."artists" ("name", "mbid");

    CREATE TABLE "listen"."albums" (
      "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      "name" text NOT NULL,
      "mbid" varchar(36),
      "artist_id" integer NOT NULL REFERENCES "listen"."artists"("id"),
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "deleted_at" timestamp with time zone
    );
    CREATE UNIQUE INDEX "albums_name_artist_id_mbid_idx" ON "listen"."albums" ("name", "artist_id", "mbid");

    CREATE TABLE "listen"."tracks" (
      "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      "name" text NOT NULL,
      "mbid" varchar(36),
      "artist_id" integer NOT NULL REFERENCES "listen"."artists"("id"),
      "album_id" integer REFERENCES "listen"."albums"("id"),
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "deleted_at" timestamp with time zone
    );
    CREATE UNIQUE INDEX "tracks_name_artist_id_mbid_idx" ON "listen"."tracks" ("name", "artist_id", "mbid");

    CREATE TABLE "listen"."scrobbles" (
      "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      "track_id" integer NOT NULL REFERENCES "listen"."tracks"("id"),
      "listened_at" timestamp with time zone NOT NULL,
      "source" "listen"."source" NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "deleted_at" timestamp with time zone
    );
    CREATE UNIQUE INDEX "scrobbles_track_id_listened_at_idx" ON "listen"."scrobbles" ("track_id", "listened_at");
  `);

  db = drizzle({ client, schema }) as unknown as Database;
});

afterAll(async () => {
  await client.close();
});

describe("recordListen", () => {
  const listen = {
    artist: { name: "Radiohead", mbid: "a74b1b7f-71a5-4011-9441-d0b5e4122711" },
    album: { name: "OK Computer", mbid: "b0b45097-91e7-3731-86e1-3f3af4573a68" },
    track: { name: "Paranoid Android", mbid: "9186052c-3ab3-4a64-84e5-0e0b3a3e8301" },
    listenedAt: new Date("2024-01-15T20:30:00Z"),
    source: "lastfm" as const,
  };

  it("creates artist, album, track, and scrobble for a complete listen", async () => {
    const result = await recordListen(db, listen);

    expect(result.wasNew).toBe(true);
    expect(result.scrobbleId).toBeGreaterThan(0);
    expect(result.artistId).toBeGreaterThan(0);
    expect(result.albumId).toBeGreaterThan(0);
    expect(result.trackId).toBeGreaterThan(0);
  });

  it("returns wasNew: false and same IDs for duplicate listen", async () => {
    const first = await recordListen(db, listen);
    const second = await recordListen(db, listen);

    expect(second.wasNew).toBe(false);
    expect(second.scrobbleId).toBe(first.scrobbleId);
    expect(second.artistId).toBe(first.artistId);
    expect(second.albumId).toBe(first.albumId);
    expect(second.trackId).toBe(first.trackId);
  });

  it("handles a track with no album", async () => {
    const result = await recordListen(db, {
      artist: { name: "Burial" },
      track: { name: "Archangel" },
      listenedAt: new Date("2024-02-10T18:00:00Z"),
      source: "spotify",
    });

    expect(result.wasNew).toBe(true);
    expect(result.albumId).toBeNull();
    expect(result.trackId).toBeGreaterThan(0);
  });

  it("resolves entities without MBIDs", async () => {
    const result = await recordListen(db, {
      artist: { name: "Unknown Artist" },
      album: { name: "Unknown Album" },
      track: { name: "Unknown Track" },
      listenedAt: new Date("2024-03-01T12:00:00Z"),
      source: "tidal",
    });

    expect(result.wasNew).toBe(true);
    expect(result.artistId).toBeGreaterThan(0);
    expect(result.albumId).toBeGreaterThan(0);
    expect(result.trackId).toBeGreaterThan(0);

    // Same listen again — should still deduplicate
    const dup = await recordListen(db, {
      artist: { name: "Unknown Artist" },
      album: { name: "Unknown Album" },
      track: { name: "Unknown Track" },
      listenedAt: new Date("2024-03-01T12:00:00Z"),
      source: "tidal",
    });

    expect(dup.wasNew).toBe(false);
    expect(dup.artistId).toBe(result.artistId);
  });

  it("reuses artist and album across different tracks", async () => {
    const a = await recordListen(db, {
      artist: { name: "Aphex Twin" },
      album: { name: "Selected Ambient Works 85-92" },
      track: { name: "Xtal" },
      listenedAt: new Date("2024-04-01T10:00:00Z"),
      source: "lastfm",
    });

    const b = await recordListen(db, {
      artist: { name: "Aphex Twin" },
      album: { name: "Selected Ambient Works 85-92" },
      track: { name: "Ageispolis" },
      listenedAt: new Date("2024-04-01T10:05:00Z"),
      source: "lastfm",
    });

    expect(b.artistId).toBe(a.artistId);
    expect(b.albumId).toBe(a.albumId);
    expect(b.trackId).not.toBe(a.trackId);
    expect(b.scrobbleId).not.toBe(a.scrobbleId);
  });
});
