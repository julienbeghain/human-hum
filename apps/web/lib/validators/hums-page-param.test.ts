import { describe, expect, it } from "vitest"

import { humsPageParamSchema } from "./hums-page-param"

describe("humsPageParamSchema", () => {
  it("coerces a valid numeric string to an integer", () => {
    expect(humsPageParamSchema.parse("1")).toBe(1)
    expect(humsPageParamSchema.parse("5")).toBe(5)
  })

  it.each([
    ["undefined", undefined],
    ["a non-numeric string", "abc"],
    ["a negative value", "-3"],
    ["zero", "0"],
    ["a fractional value", "1.5"],
    ["an overflow value", "1e999"],
  ])("falls back to page 1 for %s", (_label, input) => {
    expect(humsPageParamSchema.parse(input)).toBe(1)
  })
})
