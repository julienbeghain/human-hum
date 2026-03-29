import { pgSchema, timestamp } from "drizzle-orm/pg-core"

export const listenSchema = pgSchema("listen")

const createdAt = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}

const updatedAt = {
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .$onUpdate(() => new Date())
    .defaultNow()
    .notNull(),
}

const deletedAt = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}

export const timestamps = {
  ...createdAt,
  ...updatedAt,
  ...deletedAt,
}

export const timestampsWithoutSoftDelete = {
  ...createdAt,
  ...updatedAt,
}

export const timestampsWithoutUpdate = {
  ...createdAt,
  ...deletedAt,
}
