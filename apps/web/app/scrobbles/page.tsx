import { db } from "@workspace/db";
import { getRecentScrobbles } from "@workspace/db/queries";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";

function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function ScrobblesPage() {
  const rows = await getRecentScrobbles(db);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-medium">Scrobbles</h1>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">
          No scrobbles yet. Import some listening history first.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Track</TableHead>
              <TableHead>Artist</TableHead>
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
                <TableCell className="text-muted-foreground text-right">
                  {formatTimestamp(row.listenedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
