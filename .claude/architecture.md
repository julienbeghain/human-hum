# Architecture

Monorepo layout and dependency graph are in the filesystem and `package.json` files — read them directly. This file captures design decisions that aren't obvious from the code.

## Key Design Decisions

- **UI package owns styles** — `globals.css` lives in `packages/ui`, apps import it via `@workspace/ui/globals.css`
- **RSC by default** — components are server components unless marked `"use client"`
- **Turbopack for dev** — `next dev --turbopack` for fast local iteration
- **DB package is shared** — both `apps/web` and `apps/import` import from `@workspace/db`
- **Star schema** — normalised dimension tables (artists, albums, tracks) with scrobbles as fact table
- **All DB access through Drizzle** — never raw SQL
- **Independent queries run with `Promise.all`** — never sequential `await`s for data that doesn't depend on each other
- **Schema is fluid pre-launch** — nothing is in production, so the DB can be wiped for a better design rather than constrained by past choices; migration files are not required yet
