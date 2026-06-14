import { and, asc, count, desc, eq, gt, lt } from "drizzle-orm"

import type { Database } from "../index"
import * as schema from "../schema"
import { addArtistCondition, buildFilterConditions } from "./filter"
import type {
  GetHumsParams,
  PaginatedHums,
  HumRow,
  HumDetail,
} from "./types"

const DEFAULT_PAGE_SIZE = 50

const selectColumns = {
  id: schema.hums.id,
  listenedAt: schema.hums.listenedAt,
  source: schema.hums.source,
  trackName: schema.tracks.name,
  artistId: schema.artists.id,
  artistName: schema.artists.name,
  albumId: schema.hums.albumId,
  albumName: schema.albums.name,
}

function baseQuery(db: Database) {
  return db
    .select(selectColumns)
    .from(schema.hums)
    .innerJoin(schema.tracks, eq(schema.hums.trackId, schema.tracks.id))
    .innerJoin(schema.artists, eq(schema.tracks.artistId, schema.artists.id))
    .leftJoin(schema.albums, eq(schema.hums.albumId, schema.albums.id))
}

function countQuery(db: Database) {
  return db
    .select({ value: count() })
    .from(schema.hums)
    .innerJoin(schema.tracks, eq(schema.hums.trackId, schema.tracks.id))
    .innerJoin(schema.artists, eq(schema.tracks.artistId, schema.artists.id))
    .leftJoin(schema.albums, eq(schema.hums.albumId, schema.albums.id))
}

export async function getHums(
  db: Database,
  params?: GetHumsParams
): Promise<PaginatedHums> {
  const filter = params ?? {}
  const pageSize = filter.pageSize ?? DEFAULT_PAGE_SIZE
  const page = filter.page ?? 1
  const orderAsc = filter.orderAsc ?? false

  const conditions = buildFilterConditions(filter)
  addArtistCondition(conditions, filter)

  if (filter.cursor) {
    conditions.push(
      orderAsc
        ? gt(schema.hums.listenedAt, filter.cursor)
        : lt(schema.hums.listenedAt, filter.cursor)
    )
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined
  const orderByClause = orderAsc
    ? asc(schema.hums.listenedAt)
    : desc(schema.hums.listenedAt)
  const offset = (page - 1) * pageSize

  const [rows, countResult] = await Promise.all([
    baseQuery(db)
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(pageSize)
      .offset(offset),
    countQuery(db).where(whereClause),
  ])

  return {
    rows: rows as HumRow[],
    totalCount: countResult[0]?.value ?? 0,
  }
}

export async function getHumById(
  db: Database,
  id: number
): Promise<HumDetail | null> {
  const [row] = await db
    .select({
      id: schema.hums.id,
      listenedAt: schema.hums.listenedAt,
      source: schema.hums.source,
      trackId: schema.hums.trackId,
      trackName: schema.tracks.name,
      artistId: schema.tracks.artistId,
      artistName: schema.artists.name,
      albumId: schema.hums.albumId,
      albumName: schema.albums.name,
    })
    .from(schema.hums)
    .innerJoin(schema.tracks, eq(schema.hums.trackId, schema.tracks.id))
    .innerJoin(schema.artists, eq(schema.tracks.artistId, schema.artists.id))
    .leftJoin(schema.albums, eq(schema.hums.albumId, schema.albums.id))
    .where(eq(schema.hums.id, id))

  if (!row) return null

  const [trackStats, artistStats] = await Promise.all([
    db
      .select({ value: count() })
      .from(schema.hums)
      .where(eq(schema.hums.trackId, row.trackId)),
    db
      .select({ value: count() })
      .from(schema.hums)
      .innerJoin(schema.tracks, eq(schema.hums.trackId, schema.tracks.id))
      .where(eq(schema.tracks.artistId, row.artistId)),
  ])

  return {
    ...row,
    trackHumCount: trackStats[0]?.value ?? 0,
    artistHumCount: artistStats[0]?.value ?? 0,
  } as HumDetail
}
