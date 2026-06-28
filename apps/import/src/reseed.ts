import { readFileSync } from "node:fs"
import { createDb } from "@workspace/db"
import { env } from "@workspace/db/env"
import { bulkIngest, listenInputFromSnapshot } from "@workspace/db/ingestion"
import { parse } from "@workspace/db/snapshot"

const file = process.argv[2]
if (!file) {
  console.error("Usage: pnpm reseed <snapshot.jsonl>")
  process.exit(1)
}

const db = createDb(env.DATABASE_URL)

const { header, records } = parse(readFileSync(file, "utf-8"))
console.log(
  `Reseeding ${records.length} record(s) from snapshot v${header.snapshotVersion}...`
)

bulkIngest(db, records.map(listenInputFromSnapshot), {
  onProgress: (p) => {
    const pct = Math.round((p.processedRecords / p.totalRecords) * 100)
    process.stdout.write(
      `\r  ${p.processedRecords}/${p.totalRecords} (${pct}%) — ${p.insertedHums} inserted, ${p.skippedHums} skipped`
    )
  },
})
  .then((result) => {
    process.stdout.write("\n")
    console.log(
      `Inserted ${result.insertedHums} new hum(s), skipped ${result.skippedHums} existing.`
    )
  })
  .catch((err) => {
    console.error("Reseed failed:", err)
    process.exit(1)
  })
