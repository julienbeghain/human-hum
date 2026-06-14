import { createDb } from "@workspace/db"
import { importHums, LastfmFetcher } from "@workspace/db/importers/lastfm"

import { env } from "./env"

const backfill = process.argv.includes("--backfill")
const user = env.LASTFM_USER
const db = createDb(env.DATABASE_URL)

const fetcher = new LastfmFetcher(env.LASTFM_API_KEY, user)
const mode = backfill ? "full backfill" : "incremental sync"
console.log(`Importing hums for ${user} (${mode})...`)

importHums(db, fetcher, {
  backfill: backfill || undefined,
  onProgress: ({ page, totalPages, imported, skipped }) => {
    console.log(
      `Page ${page}/${totalPages}: ${imported} imported, ${skipped} skipped`
    )
  },
})
  .then(({ totalImported, totalSkipped, pagesProcessed, completeness }) => {
    console.log(
      `\nDone: ${totalImported} imported, ${totalSkipped} skipped across ${pagesProcessed} page(s)`
    )
    if (completeness) {
      console.log(
        `Completeness: ${completeness.localCount}/${completeness.remoteTotal} hums (${completeness.coveragePercent}%)`
      )
    }
  })
  .catch((err) => {
    console.error("Import failed:", err)
    process.exit(1)
  })
