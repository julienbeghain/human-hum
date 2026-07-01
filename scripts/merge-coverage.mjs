import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// Istanbul coverage-final.json is a flat map keyed by absolute file path, so
// merging per-package reports is a shallow object merge (paths never collide
// across packages). fallow's `health.coverage` accepts a single file, so we
// combine every package report into one it can read.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const reports = ["packages/db/coverage/coverage-final.json", "apps/web/coverage/coverage-final.json"]

const merged = {}
for (const relative of reports) {
  const path = resolve(root, relative)
  Object.assign(merged, JSON.parse(readFileSync(path, "utf8")))
}

const out = resolve(root, "coverage/coverage-final.json")
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(merged))

console.log(`merged ${reports.length} reports → ${out} (${Object.keys(merged).length} files)`)
