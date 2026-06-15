import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@workspace/ui/components/pagination"

import { getPageNumbers } from "@/lib/pagination"

interface HumsPaginationProps {
  currentPage: number
  totalPages: number
  totalCount: number
}

function buildPageHref(page: number): string {
  if (page <= 1) return "/hums"
  return `/hums?page=${page}`
}

function disabledLinkProps(disabled: boolean) {
  return {
    "aria-disabled": disabled,
    tabIndex: disabled ? -1 : undefined,
    className: disabled ? "pointer-events-none opacity-50" : undefined,
  }
}

export function HumsPagination({
  currentPage,
  totalPages,
  totalCount,
}: HumsPaginationProps) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        {totalCount.toLocaleString()} hums
      </p>
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href={buildPageHref(currentPage - 1)}
              {...disabledLinkProps(currentPage <= 1)}
            />
          </PaginationItem>

          {getPageNumbers(currentPage, totalPages).map((p, i) =>
            p === null ? (
              <PaginationItem key={`ellipsis-${i}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={p}>
                <PaginationLink
                  href={buildPageHref(p)}
                  isActive={p === currentPage}
                >
                  {p}
                </PaginationLink>
              </PaginationItem>
            )
          )}

          <PaginationItem>
            <PaginationNext
              href={buildPageHref(currentPage + 1)}
              {...disabledLinkProps(currentPage >= totalPages)}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}
