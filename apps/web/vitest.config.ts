import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      // `json` emits coverage-final.json in Istanbul format, merged with the db
      // report and read by `fallow health` for measured CRAP scores.
      reporter: ["text", "json"],
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/*.test.ts"],
    },
  },
})
