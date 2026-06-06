import { defineConfig } from "vitest/config"

// Tests run against pglite, not a real database, but importing modules that
// read the validated `env` (e.g. enrichment) triggers schema validation at
// import time. Provide dummy values so that boundary is satisfied.
export default defineConfig({
  test: {
    env: {
      DATABASE_URL: "postgres://test:test@localhost/test",
      LASTFM_API_KEY: "test-key",
    },
  },
})
