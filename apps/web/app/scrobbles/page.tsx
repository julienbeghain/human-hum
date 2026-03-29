import { db } from "@workspace/db"
import { getScrobbles } from "@workspace/db/queries"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@workspace/ui/components/pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

const DEFAULT_PAGE_SIZE = 50

function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function parsePageParam(value: string | string[] | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

function buildPageHref(page: number): string {
  if (page <= 1) return "/scrobbles"
  return `/scrobbles?page=${page}`
}

/**
 * Returns the page numbers to render given current page and total pages.
 * Always shows first, last, current, and one page on each side of current.
 * Gaps are represented as `null` (rendered as ellipsis).
 */
function getPageNumbers(
  currentPage: number,
  totalPages: number
): (number | null)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages = new Set<number>()
  pages.add(1)
  pages.add(totalPages)
  for (
    let i = Math.max(2, currentPage - 1);
    i <= Math.min(totalPages - 1, currentPage + 1);
    i++
  ) {
    pages.add(i)
  }

  const sorted = [...pages].sort((a, b) => a - b)
  const result: (number | null)[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) {
      result.push(null)
    }
    result.push(sorted[i]!)
  }
  return result
}

export default async function ScrobblesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  const page = parsePageParam(searchParams.page)
  const { rows, totalCount } = await getScrobbles(db, {
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  })

  const totalPages = Math.max(1, Math.ceil(totalCount / DEFAULT_PAGE_SIZE))
  const clampedPage = Math.min(page, totalPages)

  return (
    <div className="flex flex-col gap-4 p-6">
      {rows.length === 0 && clampedPage === 1 ? (
        <p className="text-muted-foreground">
          No scrobbles yet. Import some listening history first.
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Track</TableHead>
                <TableHead>Artist</TableHead>
                <TableHead>Album</TableHead>
                <TableHead className="text-right">Played</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.trackName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.artistName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.albumName ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatTimestamp(row.listenedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                {totalCount.toLocaleString()} scrobbles
              </p>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href={buildPageHref(clampedPage - 1)}
                      aria-disabled={clampedPage <= 1}
                      tabIndex={clampedPage <= 1 ? -1 : undefined}
                      className={
                        clampedPage <= 1
                          ? "pointer-events-none opacity-50"
                          : undefined
                      }
                    />
                  </PaginationItem>

                  {getPageNumbers(clampedPage, totalPages).map((p, i) =>
                    p === null ? (
                      <PaginationItem key={`ellipsis-${i}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={p}>
                        <PaginationLink
                          href={buildPageHref(p)}
                          isActive={p === clampedPage}
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}

                  <PaginationItem>
                    <PaginationNext
                      href={buildPageHref(clampedPage + 1)}
                      aria-disabled={clampedPage >= totalPages}
                      tabIndex={clampedPage >= totalPages ? -1 : undefined}
                      className={
                        clampedPage >= totalPages
                          ? "pointer-events-none opacity-50"
                          : undefined
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}
    </div>
  )
}
