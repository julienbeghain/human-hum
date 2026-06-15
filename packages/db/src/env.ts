import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    // Lives here, not in the import app: enrichment.ts (db code) reads it,
    // and a package can't extend an app's env module.
    LASTFM_API_KEY: z.string().min(1),
    TIDAL_CLIENT_ID: z.string().min(1),
    TIDAL_CLIENT_SECRET: z.string().min(1),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
