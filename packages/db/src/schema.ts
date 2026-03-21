import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// --- Enums ---

export const sourceEnum = pgEnum("source", ["lastfm", "spotify", "tidal"]);

// --- Dimension tables ---

export const artists = pgTable(
  "artists",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),
    mbid: varchar({ length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("artists_name_mbid_idx").on(t.name, t.mbid)],
);

export const albums = pgTable(
  "albums",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),
    mbid: varchar({ length: 36 }),
    artistId: integer("artist_id")
      .notNull()
      .references(() => artists.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("albums_name_artist_id_mbid_idx").on(
      t.name,
      t.artistId,
      t.mbid,
    ),
    index("albums_artist_id_idx").on(t.artistId),
  ],
);

export const tracks = pgTable(
  "tracks",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),
    mbid: varchar({ length: 36 }),
    artistId: integer("artist_id")
      .notNull()
      .references(() => artists.id),
    albumId: integer("album_id").references(() => albums.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("tracks_name_artist_id_mbid_idx").on(
      t.name,
      t.artistId,
      t.mbid,
    ),
    index("tracks_artist_id_idx").on(t.artistId),
    index("tracks_album_id_idx").on(t.albumId),
  ],
);

// --- Fact table ---

export const scrobbles = pgTable(
  "scrobbles",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    trackId: integer("track_id")
      .notNull()
      .references(() => tracks.id),
    listenedAt: timestamp("listened_at", { withTimezone: true }).notNull(),
    source: sourceEnum().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
