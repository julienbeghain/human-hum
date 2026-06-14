import { z } from "zod"

/**
 * Validates the `page` searchParam at the scrobbles-page trust boundary.
 * Any invalid input (non-numeric, <1, fractional, overflow) falls back to 1
 * so a hand-typed URL can never render a broken page.
 */
export const scrobblesPageParamSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(Number.MAX_SAFE_INTEGER)
  .catch(1)
