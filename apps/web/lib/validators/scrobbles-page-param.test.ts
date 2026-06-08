import { describe, expect, it } from "vitest"

import { scrobblesPageParamSchema } from "./scrobbles-page-param"

describe("scrobblesPageParamSchema", () => {
  it("coerces a valid numeric string to an integer", () => {
    expect(scrobblesPageParamSchema.parse("1")).toBe(1)
    expect(scrobblesPageParamSchema.parse("5")).toBe(5)
  })

  it.each([
    ["undefined", undefined],
    ["a non-numeric string", "abc"],
    ["a negative value", "-3"],
    ["zero", "0"],
    ["a fractional value", "1.5"],
    ["an overflow value", "1e999"],
  ])("falls back to page 1 for %s", (_label, input) => {
    expect(scrobblesPageParamSchema.parse(input)).toBe(1)
  })
})
