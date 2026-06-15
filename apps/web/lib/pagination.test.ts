import { describe, expect, it } from "vitest"

import { getPageNumbers, resolvePage } from "./pagination"

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

describe("resolvePage", () => {
  it("computes total pages, rounding a partial last page up", () => {
    expect(resolvePage(1, 101, 50).totalPages).toBe(3)
    expect(resolvePage(1, 100, 50).totalPages).toBe(2)
  })

  it("does not redirect an in-range page", () => {
    expect(resolvePage(2, 101, 50).redirectTo).toBeNull()
  })

  it("does not redirect the last page", () => {
    expect(resolvePage(3, 101, 50).redirectTo).toBeNull()
  })

  it("redirects an out-of-range page to the last page", () => {
    expect(resolvePage(9999, 101, 50)).toEqual({
      totalPages: 3,
      redirectTo: 3,
    })
  })

  it("reports one page and redirects past it when there is no data", () => {
    expect(resolvePage(1, 0, 50)).toEqual({ totalPages: 1, redirectTo: null })
    expect(resolvePage(5, 0, 50)).toEqual({ totalPages: 1, redirectTo: 1 })
  })
})
