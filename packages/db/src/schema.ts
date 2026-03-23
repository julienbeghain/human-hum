import {
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { listenSchema, timestampsWithoutUpdate } from "./shared";

// --- Enums ---

export const sourceEnum = listenSchema.enum("source", [
  "lastfm",
  "spotify",
  "tidal",
]);

// --- Dimension tables ---

export const artists = listenSchema.table(
  "artists",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),
    mbid: varchar({ length: 36 }),
    ...timestampsWithoutUpdate,
  },
  (t) => [uniqueIndex("artists_name_idx").on(t.name)],
);

export const albums = listenSchema.table(
  "albums",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),
    mbid: varchar({ length: 36 }),
    artistId: integer("artist_id")
      .notNull()
      .references(() => artists.id),
    ...timestampsWithoutUpdate,
  },
  (t) => [
    uniqueIndex("albums_name_artist_id_idx").on(t.name, t.artistId),
    index("albums_artist_id_idx").on(t.artistId),
  ],
);

export const tracks = listenSchema.table(
  "tracks",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),
    mbid: varchar({ length: 36 }),
    artistId: integer("artist_id")
      .notNull()
      .references(() => artists.id),
    albumId: integer("album_id").references(() => albums.id),
    ...timestampsWithoutUpdate,
  },
  (t) => [
    uniqueIndex("tracks_name_artist_id_idx").on(t.name, t.artistId),
    index("tracks_artist_id_idx").on(t.artistId),
    index("tracks_album_id_idx").on(t.albumId),
  ],
);

// --- Fact table ---

export const scrobbles = listenSchema.table(
  "scrobbles",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    trackId: integer("track_id")
      .notNull()
      .references(() => tracks.id),
    listenedAt: timestamp("listened_at", { withTimezone: true }).notNull(),
    source: sourceEnum().notNull(),
    ...timestampsWithoutUpdate,
  },
  (t) => [
    uniqueIndex("scrobbles_track_id_listened_at_idx").on(
      t.trackId,
      t.listenedAt,
    ),
    index("scrobbles_listened_at_idx").on(t.listenedAt),
    index("scrobbles_source_idx").on(t.source),
  ],
);
