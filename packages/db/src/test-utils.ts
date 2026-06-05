import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"

import type { Database } from "./index"
import * as schema from "./schema"

const MIGRATIONS_DIR = join(import.meta.dirname, "../drizzle")

function loadMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf-8"))
}

function splitStatements(migration: string): string[] {
  return migration
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function setupTestDb(): Promise<{
  db: Database
  client: PGlite
}> {
  const client = new PGlite()

  for (const migration of loadMigrations()) {
    for (const statement of splitStatements(migration)) {
      await client.exec(statement)
    }
  }

  const db = drizzle({ client, schema }) as unknown as Database
  return { db, client }
}
