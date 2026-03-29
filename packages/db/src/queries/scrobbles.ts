import { and, asc, count, desc, eq, gt, lt } from "drizzle-orm";

import type { Database } from "../index";
import * as schema from "../schema";
import { addArtistCondition, buildFilterConditions } from "./filter";
import type {
  GetScrobblesParams,
  PaginatedScrobbles,
  ScrobbleRow,
} from "./types";

const DEFAULT_PAGE_SIZE = 50;

const selectColumns = {
  id: schema.scrobbles.id,
  listenedAt: schema.scrobbles.listenedAt,
  source: schema.scrobbles.source,
  trackName: schema.tracks.name,
  artistName: schema.artists.name,
  albumName: schema.albums.name,
};

function baseQuery(db: Database) {
  return db
    .select(selectColumns)
    .from(schema.scrobbles)
    .innerJoin(schema.tracks, eq(schema.scrobbles.trackId, schema.tracks.id))
    .innerJoin(schema.artists, eq(schema.tracks.artistId, schema.artists.id))
    .leftJoin(schema.albums, eq(schema.scrobbles.albumId, schema.albums.id));
}

function countQuery(db: Database) {
  return db
    .select({ value: count() })
    .from(schema.scrobbles)
    .innerJoin(schema.tracks, eq(schema.scrobbles.trackId, schema.tracks.id))
    .innerJoin(schema.artists, eq(schema.tracks.artistId, schema.artists.id))
    .leftJoin(schema.albums, eq(schema.scrobbles.albumId, schema.albums.id));
}

export async function getScrobbles(
  db: Database,
  params?: GetScrobblesParams,
): Promise<PaginatedScrobbles> {
  const filter = params ?? {};
  const pageSize = filter.pageSize ?? DEFAULT_PAGE_SIZE;
  const page = filter.page ?? 1;
  const orderAsc = filter.orderAsc ?? false;

  const conditions = buildFilterConditions(filter);
  addArtistCondition(conditions, filter);

  if (filter.cursor) {
    conditions.push(
      orderAsc
        ? gt(schema.scrobbles.listenedAt, filter.cursor)
        : lt(schema.scrobbles.listenedAt, filter.cursor),
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const orderByClause = orderAsc
    ? asc(schema.scrobbles.listenedAt)
    : desc(schema.scrobbles.listenedAt);
  const offset = (page - 1) * pageSize;

  const [rows, countResult] = await Promise.all([
    baseQuery(db).where(whereClause).orderBy(orderByClause).limit(pageSize).offset(offset),
    countQuery(db).where(whereClause),
  ]);

  return {
    rows: rows as ScrobbleRow[],
    totalCount: countResult[0]?.value ?? 0,
  };
}
