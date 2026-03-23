import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

export function createDb(url: string) {
  const sql = neon(url);
  return drizzle({ client: sql, schema });
}

export const db = createDb(process.env.DATABASE_URL!);

export { schema };
export type Database = ReturnType<typeof createDb>;
