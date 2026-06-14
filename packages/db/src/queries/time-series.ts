import { and, count, eq, sql } from "drizzle-orm"

import type { Database } from "../index"
import * as schema from "../schema"
import { addArtistCondition, buildFilterConditions } from "./filter"
import type {
  GetTimeSeriesParams,
  ListeningClockSlot,
  HumFilter,
  TimeSeriesBucket,
} from "./types"

export async function getTimeSeries(
  db: Database,
  params: GetTimeSeriesParams
): Promise<TimeSeriesBucket[]> {
  const { period, ...filter } = params
  const conditions = buildFilterConditions(filter)
  addArtistCondition(conditions, filter)

  const validPeriods = ["day", "week", "month", "year"] as const
  if (!validPeriods.includes(period)) {
    throw new Error(`Invalid period: ${period}`)
  }
  const bucket = sql<string>`date_trunc(${sql.raw(`'${period}'`)}, ${schema.hums.listenedAt})`

  const rows = await db
    .select({
      period: bucket,
      count: count(schema.hums.id),
    })
    .from(schema.hums)
    .innerJoin(schema.tracks, eq(schema.hums.trackId, schema.tracks.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(bucket)
    .orderBy(bucket)

  return rows.map((r) => ({ period: new Date(r.period), count: r.count }))
}

export async function getListeningClock(
  db: Database,
  params?: HumFilter
): Promise<ListeningClockSlot[]> {
  const filter = params ?? {}
  const conditions = buildFilterConditions(filter)
  addArtistCondition(conditions, filter)

  const hour = sql<number>`extract(hour from ${schema.hums.listenedAt})::int`

  const rows = await db
    .select({
      hour,
      count: count(schema.hums.id),
    })
    .from(schema.hums)
    .innerJoin(schema.tracks, eq(schema.hums.trackId, schema.tracks.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(hour)
    .orderBy(hour)

  // Fill missing hours with 0
  const hourMap = new Map(rows.map((r) => [r.hour, r.count]))
  return Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    count: hourMap.get(i) ?? 0,
  }))
}
