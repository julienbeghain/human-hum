import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createDb } from "@workspace/db"
import { exportHums } from "@workspace/db/queries"
import { serialize } from "@workspace/db/snapshot"

import { env } from "./env"

const db = createDb(env.DATABASE_URL)

console.log("Exporting ground-truth snapshot...")

exportHums(db)
  .then((records) => {
    const exportedAt = new Date()
    const jsonl = serialize(records, exportedAt)

    const dir = join(import.meta.dirname, "../snapshots")
    mkdirSync(dir, { recursive: true })

    const stamp = exportedAt.toISOString().replace(/[:.]/g, "-")
    const file = join(dir, `snapshot-${stamp}.jsonl`)
    writeFileSync(file, jsonl)

    console.log(`Wrote ${records.length} record(s) to ${file}`)
  })
  .catch((err) => {
    console.error("Export failed:", err)
    process.exit(1)
  })
