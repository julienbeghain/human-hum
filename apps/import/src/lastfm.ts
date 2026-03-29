import { createDb } from "@workspace/db"
import { importScrobbles, LastfmFetcher } from "@workspace/db/importers/lastfm"

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

const backfill = process.argv.includes("--backfill")
const apiKey = requireEnv("LASTFM_API_KEY")
const user = requireEnv("LASTFM_USER")
const db = createDb(requireEnv("DATABASE_URL"))

const fetcher = new LastfmFetcher(apiKey, user)
const mode = backfill ? "full backfill" : "incremental sync"
console.log(`Importing scrobbles for ${user} (${mode})...`)

importScrobbles(db, fetcher, {
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
        `Completeness: ${completeness.localCount}/${completeness.remotePlaycount} scrobbles (${completeness.coveragePercent}%)`
      )
    }
  })
  .catch((err) => {
    console.error("Import failed:", err)
    process.exit(1)
  })
