import { defineConfig } from "drizzle-kit"

export default defineConfig({
  out: "./drizzle",
  schema: ["./src/shared.ts", "./src/schema.ts"],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!.replace("-pooler", ""),
  },
  schemaFilter: ["listen"],
})
