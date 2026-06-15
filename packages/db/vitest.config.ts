import { defineConfig } from "vitest/config"

// Tests run against pglite, not a real database, but importing modules that
// read the validated `env` (e.g. enrichment) triggers schema validation at
// import time. Provide dummy values so that boundary is satisfied.
export default defineConfig({
  test: {
    // Every test spins up pglite and runs all migrations; some do it inline in
    // the test body (not a hook), so the default 5s testTimeout is hit under
    // parallel CPU contention. Give pglite-backed bodies the same 30s headroom
    // the hook-based suites already use via vi.setConfig({ hookTimeout }).
    testTimeout: 30_000,
    env: {
      DATABASE_URL: "postgres://test:test@localhost/test",
      LASTFM_API_KEY: "test-key",
      TIDAL_CLIENT_ID: "test-client-id",
      TIDAL_CLIENT_SECRET: "test-client-secret",
    },
  },
})
