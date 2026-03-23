import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.setConfig({ hookTimeout: 30_000 });

import type { Database } from "./index";
import { recordListen } from "./ingestion";
import { getRecentScrobbles } from "./queries";
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
});

afterAll(async () => {
  await client.close();
});

describe("getRecentScrobbles", () => {
  it("returns scrobbles with track and artist names", async () => {
    await recordListen(db, {
      artist: { name: "Boards of Canada" },
      track: { name: "Roygbiv" },
      listenedAt: new Date("2024-05-01T10:00:00Z"),
      source: "lastfm",
    });

    const rows = await getRecentScrobbles(db);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows.find((r) => r.trackName === "Roygbiv");
    expect(row).toBeDefined();
    expect(row!.artistName).toBe("Boards of Canada");
    expect(row!.albumName).toBeNull();
    expect(row!.source).toBe("lastfm");
    expect(row!.listenedAt).toBeInstanceOf(Date);
  });

  it("includes album name when scrobble has an album", async () => {
    await recordListen(db, {
      artist: { name: "Boards of Canada" },
      album: { name: "Music Has the Right to Children" },
      track: { name: "Aquarius" },
      listenedAt: new Date("2024-05-01T11:00:00Z"),
      source: "lastfm",
    });

    const rows = await getRecentScrobbles(db);

    const row = rows.find((r) => r.trackName === "Aquarius");
    expect(row).toBeDefined();
    expect(row!.albumName).toBe("Music Has the Right to Children");
  });

  it("returns scrobbles ordered by listenedAt descending", async () => {
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

    const rows = await getRecentScrobbles(db);

    expect(rows.length).toBeGreaterThanOrEqual(2);
    // First row should be the most recent
    expect(rows[0]!.listenedAt.getTime()).toBeGreaterThanOrEqual(
      rows[1]!.listenedAt.getTime(),
    );
  });

  it("respects the limit option", async () => {
    const rows = await getRecentScrobbles(db, { limit: 1 });
    expect(rows.length).toBe(1);
  });
});
