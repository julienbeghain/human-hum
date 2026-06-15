import { describe, expect, it } from "vitest"

import { getPageNumbers } from "./pagination"

describe("getPageNumbers", () => {
  it("returns every page sequentially when there are 7 or fewer", () => {
    expect(getPageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5])
    expect(getPageNumbers(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it("returns a single page for a one-page result", () => {
    expect(getPageNumbers(1, 1)).toEqual([1])
  })

  it("returns an empty list when there are no pages", () => {
    expect(getPageNumbers(1, 0)).toEqual([])
  })

  it("collapses the tail with an ellipsis when near the start", () => {
    expect(getPageNumbers(1, 10)).toEqual([1, 2, null, 10])
  })

  it("collapses the head with an ellipsis when near the end", () => {
    expect(getPageNumbers(10, 10)).toEqual([1, null, 9, 10])
  })

  it("collapses both sides with ellipses when in the middle", () => {
    expect(getPageNumbers(5, 10)).toEqual([1, null, 4, 5, 6, null, 10])
  })

  it("omits the ellipsis when the window is adjacent to an edge", () => {
    expect(getPageNumbers(2, 8)).toEqual([1, 2, 3, null, 8])
    expect(getPageNumbers(7, 8)).toEqual([1, null, 6, 7, 8])
  })
})
