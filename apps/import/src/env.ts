import { createEnv } from "@t3-oss/env-core"
import { env as dbEnv } from "@workspace/db/env"
import { z } from "zod"

export const env = createEnv({
  extends: [dbEnv],
  server: {
    LASTFM_USER: z.string().min(1),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
