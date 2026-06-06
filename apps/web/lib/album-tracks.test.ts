import { describe, expect, it } from "vitest"

import { formatDuration, sortTracks, type TrackRow } from "./album-tracks"

const row = (over: Partial<TrackRow>): TrackRow => ({
  key: over.trackName ?? "x",
  trackNumber: null,
  trackName: "x",
  scrobbleCount: 0,
  duration: null,
  ...over,
})

describe("sortTracks", () => {
  it("album-order sorts by track number ascending", () => {
    const rows = [
      row({ trackName: "C", trackNumber: 3, scrobbleCount: 1 }),
      row({ trackName: "A", trackNumber: 1, scrobbleCount: 50 }),
      row({ trackName: "B", trackNumber: 2, scrobbleCount: 10 }),
    ]
    expect(sortTracks(rows, "album-order").map((r) => r.trackName)).toEqual([
      "A",
      "B",
      "C",
    ])
  })

  it("scrobble-count-descending sorts by scrobble count descending", () => {
    const rows = [
      row({ trackName: "A", trackNumber: 1, scrobbleCount: 50 }),
      row({ trackName: "B", trackNumber: 2, scrobbleCount: 10 }),
      row({ trackName: "C", trackNumber: 3, scrobbleCount: 99 }),
    ]
    expect(
      sortTracks(rows, "scrobble-count-descending").map((r) => r.trackName)
    ).toEqual(["C", "A", "B"])
  })

  it("album-order keeps null track numbers in their original order (un-enriched album)", () => {
    const rows = [
      row({ trackName: "first", trackNumber: null, scrobbleCount: 5 }),
      row({ trackName: "second", trackNumber: null, scrobbleCount: 9 }),
    ]
    expect(sortTracks(rows, "album-order").map((r) => r.trackName)).toEqual([
      "first",
      "second",
    ])
  })

  it("album-order sinks null track numbers below numbered tracks", () => {
    const rows = [
      row({ trackName: "unmatched", trackNumber: null }),
      row({ trackName: "two", trackNumber: 2 }),
      row({ trackName: "one", trackNumber: 1 }),
    ]
    expect(sortTracks(rows, "album-order").map((r) => r.trackName)).toEqual([
      "one",
      "two",
      "unmatched",
    ])
  })

  it("does not mutate the input array", () => {
    const rows = [
      row({ trackName: "B", trackNumber: 2 }),
      row({ trackName: "A", trackNumber: 1 }),
    ]
    sortTracks(rows, "album-order")
    expect(rows.map((r) => r.trackName)).toEqual(["B", "A"])
  })
})

describe("formatDuration", () => {
  it("formats seconds as m:ss", () => {
    expect(formatDuration(172)).toBe("2:52")
  })

  it("zero-pads the seconds", () => {
    expect(formatDuration(65)).toBe("1:05")
  })

  it("formats durations under a minute", () => {
    expect(formatDuration(9)).toBe("0:09")
  })

  it("formats durations of an hour or more without an hours segment", () => {
    expect(formatDuration(3725)).toBe("62:05")
  })

  it("renders an em-dash for null duration", () => {
    expect(formatDuration(null)).toBe("—")
  })

  it("renders an em-dash for a zero duration", () => {
    expect(formatDuration(0)).toBe("—")
  })
})
