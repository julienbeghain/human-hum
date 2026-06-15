import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const VALID = {
  DATABASE_URL: "postgres://user:pass@host.neon.tech/db",
  LASTFM_API_KEY: "a-real-key",
  TIDAL_CLIENT_ID: "a-client-id",
  TIDAL_CLIENT_SECRET: "a-client-secret",
}

async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [key, value] of Object.entries({ ...VALID, ...overrides })) {
    vi.stubEnv(key, value as string)
  }
  const mod = await import("./env")
  return mod.env
}

beforeEach(() => {
  // t3-env logs the offending issues before throwing; keep test output clean.
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("db env", () => {
  it("parses a well-formed environment into a typed object", async () => {
    const env = await loadEnv({})
    expect(env.DATABASE_URL).toBe(VALID.DATABASE_URL)
    expect(env.LASTFM_API_KEY).toBe(VALID.LASTFM_API_KEY)
    expect(env.TIDAL_CLIENT_ID).toBe(VALID.TIDAL_CLIENT_ID)
    expect(env.TIDAL_CLIENT_SECRET).toBe(VALID.TIDAL_CLIENT_SECRET)
  })

  it("throws when DATABASE_URL is absent", async () => {
    await expect(loadEnv({ DATABASE_URL: undefined })).rejects.toThrow(
      "Invalid environment variables"
    )
  })

  it("throws when DATABASE_URL is not a URL", async () => {
    await expect(loadEnv({ DATABASE_URL: "not-a-url" })).rejects.toThrow(
      "Invalid environment variables"
    )
  })

  it("throws when LASTFM_API_KEY is empty", async () => {
    await expect(loadEnv({ LASTFM_API_KEY: "" })).rejects.toThrow(
      "Invalid environment variables"
    )
  })

  it("throws when TIDAL_CLIENT_ID is empty", async () => {
    await expect(loadEnv({ TIDAL_CLIENT_ID: "" })).rejects.toThrow(
      "Invalid environment variables"
    )
  })

  it("throws when TIDAL_CLIENT_SECRET is empty", async () => {
    await expect(loadEnv({ TIDAL_CLIENT_SECRET: "" })).rejects.toThrow(
      "Invalid environment variables"
    )
  })
})
