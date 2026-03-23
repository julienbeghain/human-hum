import { createDb } from "@workspace/db";
import { importScrobbles } from "@workspace/db/importers/lastfm";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const apiKey = requireEnv("LASTFM_API_KEY");
const user = requireEnv("LASTFM_USER");
const db = createDb(requireEnv("DATABASE_URL"));

console.log(`Importing scrobbles for ${user}...`);

importScrobbles(db, {
  apiKey,
  user,
  onProgress: ({ page, totalPages, imported, skipped }) => {
    console.log(
      `Page ${page}/${totalPages}: ${imported} imported, ${skipped} skipped`,
    );
  },
})
  .then(({ totalImported, totalSkipped }) => {
    console.log(
      `\nDone: ${totalImported} scrobbles imported, ${totalSkipped} skipped`,
    );
  })
  .catch((err) => {
    console.error("Import failed:", err);
    process.exit(1);
  });
