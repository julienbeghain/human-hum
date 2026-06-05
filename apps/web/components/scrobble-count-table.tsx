import type { ReactNode } from "react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

interface ScrobbleCountRow {
  key: string | number
  rank: number
  label: ReactNode
  scrobbleCount: number
}

interface ScrobbleCountTableProps {
  title: string
  itemHeader: string
  rows: ScrobbleCountRow[]
}

/**
 * A ranked table of entities (tracks, albums) with their scrobble counts.
 * Renders nothing when there are no rows.
 */
export function ScrobbleCountTable({
  title,
  itemHeader,
  rows,
}: ScrobbleCountTableProps) {
  if (rows.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-medium">{title}</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>{itemHeader}</TableHead>
            <TableHead className="text-right">Scrobbles</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="text-muted-foreground">{row.rank}</TableCell>
              <TableCell>{row.label}</TableCell>
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
