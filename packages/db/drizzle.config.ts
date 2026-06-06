import { defineConfig } from "drizzle-kit"

import { env } from "./src/env"

export default defineConfig({
  out: "./drizzle",
  schema: ["./src/shared.ts", "./src/schema.ts"],
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL.replace("-pooler", ""),
  },
  schemaFilter: ["listen"],
})
