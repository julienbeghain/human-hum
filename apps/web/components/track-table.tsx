"use client"

import { useState } from "react"

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import {
  formatDuration,
  sortTracks,
  type SortMode,
  type TrackRow,
} from "@/lib/album-tracks"

interface TrackTableProps {
  rows: TrackRow[]
}

export function TrackTable({ rows }: TrackTableProps) {
  const [sortMode, setSortMode] = useState<SortMode>("album-order")

  if (rows.length === 0) return null

  const sorted = sortTracks(rows, sortMode)

  function handleSortChange(value: string[]) {
    const next = value[0]
    if (next === "album-order" || next === "scrobble-count-descending") {
      setSortMode(next)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Tracks</h2>
        <ToggleGroup
          value={[sortMode]}
          onValueChange={handleSortChange}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="album-order">Album order</ToggleGroupItem>
          <ToggleGroupItem value="scrobble-count-descending">
            Scrobbles
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Track</TableHead>
            <TableHead className="text-right">Duration</TableHead>
            <TableHead className="text-right">Scrobbles</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="text-muted-foreground">
                {row.trackNumber ?? "—"}
              </TableCell>
              <TableCell>{row.trackName}</TableCell>
              <TableCell className="text-right text-muted-foreground">
                {formatDuration(row.duration)}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {row.scrobbleCount.toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}
