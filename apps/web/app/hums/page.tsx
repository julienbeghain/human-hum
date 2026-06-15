import Link from "next/link"
import { redirect } from "next/navigation"

import { db } from "@workspace/db"
import { getHums } from "@workspace/db/queries"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { HumsPagination } from "@/components/hums-pagination"
import { resolvePage } from "@/lib/pagination"
import { humsPageParamSchema } from "@/lib/validators/hums-page-param"

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

export default async function HumsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  const page = humsPageParamSchema.parse(searchParams.page)
  const { rows, totalCount } = await getHums(db, {
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  })

  const { totalPages, redirectTo } = resolvePage(
    page,
    totalCount,
    DEFAULT_PAGE_SIZE
  )
  if (redirectTo !== null) {
    redirect(`/hums?page=${redirectTo}`)
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      {rows.length === 0 ? (
        <p className="text-muted-foreground">
          No hums yet. Import some listening history first.
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
                  <TableCell>
                    <Link
                      href={`/hums/${row.id}`}
                      className="hover:underline"
                    >
                      {row.trackName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <Link
                      href={`/artists/${row.artistId}`}
                      className="hover:underline"
                    >
                      {row.artistName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.albumId ? (
                      <Link
                        href={`/albums/${row.albumId}`}
                        className="hover:underline"
                      >
                        {row.albumName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatTimestamp(row.listenedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <HumsPagination
            currentPage={page}
            totalPages={totalPages}
            totalCount={totalCount}
          />
        </>
      )}
    </div>
  )
}
