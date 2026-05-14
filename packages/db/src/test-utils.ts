import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"

import type { Database } from "./index"
import * as schema from "./schema"

const DDL = `
  CREATE SCHEMA IF NOT EXISTS "listen";

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
    "image_url" text,
    "enriched_at" timestamp with time zone,
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

  CREATE TABLE "listen"."album_tracks" (
    "album_id" integer NOT NULL REFERENCES "listen"."albums"("id"),
    "track_number" integer NOT NULL,
    "name" text NOT NULL,
    "track_id" integer REFERENCES "listen"."tracks"("id"),
    "duration" integer,
    PRIMARY KEY ("album_id", "track_number")
  );
  CREATE INDEX "album_tracks_track_id_idx" ON "listen"."album_tracks" ("track_id");

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
`

export async function setupTestDb(): Promise<{
  db: Database
  client: PGlite
}> {
  const client = new PGlite()
  await client.exec(DDL)
  const db = drizzle({ client, schema }) as unknown as Database
  return { db, client }
}
