import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"

import * as schema from "./schema"

export function createDb(url: string) {
  const sql = neon(url)
  return drizzle({ client: sql, schema })
}

const globalForDb = globalThis as unknown as { __drizzleDb__?: Database }

export const db =
  globalForDb.__drizzleDb__ ?? createDb(process.env.DATABASE_URL!)

globalForDb.__drizzleDb__ = db

export { schema }
export type Database = ReturnType<typeof createDb>
