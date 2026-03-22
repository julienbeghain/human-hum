# Human Hum — Onboarding Guide

## Project Overview

**human-hum** is a personal music scrobbling platform that records listening history and surfaces insights. It's built as a **pnpm monorepo** using:

| Technology | Role |
|---|---|
| **Next.js 16** | Web application framework |
| **React** | UI rendering |
| **Tailwind CSS** | Styling |
| **shadcn/ui + base-ui** | Component library (56 components) |
| **Drizzle ORM** | Database access & migrations |
| **Neon Postgres** | Serverless database |
| **Turborepo** | Monorepo build orchestration |

**Commands:** `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`

---

## Architecture Layers

The codebase is organized into 6 layers following the monorepo package structure:

```
┌─────────────────────────────────────────────────┐
│  Web Application (apps/web)                     │  ← Next.js pages & layouts
│  Data Import Pipeline (apps/import)             │  ← LastFM scrobble ingestion
├─────────────────────────────────────────────────┤
│  UI Component Library (packages/ui/components)  │  ← 55 shadcn/ui components
│  UI Infrastructure (packages/ui/lib + hooks)    │  ← cn() utility, useIsMobile
├─────────────────────────────────────────────────┤
│  Database Layer (packages/db)                   │  ← Drizzle schema, client, config
├─────────────────────────────────────────────────┤
│  Configuration & Tooling                        │  ← ESLint configs, ralph.sh
└─────────────────────────────────────────────────┘
```

### 1. Web Application (`apps/web/`) — 4 files

Next.js pages, layouts, and app-level components. The root layout configures fonts, theme provider, and tooltip context. Pages consume shared UI components via `@workspace/ui`.

### 2. Data Import Pipeline (`apps/import/`) — 1 file

A standalone script that fetches scrobbles from the LastFM API and upserts them into the star-schema database through a chain of artist → album → track → scrobble upserts.

### 3. Database Layer (`packages/db/`) — 4 files

Drizzle ORM schema definitions using a **star-schema pattern**: three dimension tables (artists, albums, tracks) and one fact table (scrobbles) in the `listen` Postgres schema. Shared timestamp mixins keep table definitions DRY.

### 4. UI Component Library (`packages/ui/src/components/`) — 55 files

56 shadcn/ui components built on `@base-ui/react` primitives. Each follows a consistent pattern: **cva** (class-variance-authority) for typed variants + **cn()** for class merging + a base-ui primitive for accessibility.

### 5. UI Infrastructure (`packages/ui/src/lib/` + `hooks/`) — 2 files

- **`utils.ts`** — exports `cn()`, the most-imported module in the project (merges Tailwind classes via clsx + tailwind-merge)
- **`use-mobile.ts`** — React hook detecting mobile viewport at 768px breakpoint

### 6. Configuration & Tooling — 8 files

Shared ESLint configs (`base.js` → `next.js` / `react-internal.js`), per-package eslint entry points, and `ralph.sh` (Claude CLI automation harness).

---

## Key Concepts & Patterns

- **Monorepo imports**: UI components are always imported as `@workspace/ui/components/<name>`, DB as `@workspace/db`
- **Component pattern**: Every UI component = base-ui primitive + cva variants + cn() class merging
- **Star-schema**: Database uses dimensional modeling — dimension tables (artists, albums, tracks) + fact table (scrobbles)
- **Upsert chain**: Data import uses `onConflictDoNothing` + re-query pattern for race-safe inserts
- **Theme hotkey**: Press `d` to toggle dark/light mode (ThemeHotkey component)

---

## Guided Tour (Recommended Reading Order)

| Step | Title | Key Files |
|---|---|---|
| 1 | **Application Shell** | `apps/web/app/layout.tsx` — Root layout, fonts, providers |
| 2 | **Theme Provider** | `apps/web/components/theme-provider.tsx` — Dark mode context + hotkey |
| 3 | **Pages** | `apps/web/app/page.tsx`, `apps/web/app/test/page.tsx` — Route → UI composition |
| 4 | **cn() Utility** | `packages/ui/src/lib/utils.ts` — Foundation every component depends on |
| 5 | **Button Blueprint** | `packages/ui/src/components/button.tsx` — The pattern all 56 components follow |
| 6 | **Sidebar (Complex UI)** | `packages/ui/src/components/sidebar.tsx` — Context provider pattern, 726 lines |
| 7 | **Database Schema** | `packages/db/src/schema.ts`, `packages/db/src/shared.ts` — Star-schema tables |
| 8 | **Database Client** | `packages/db/src/index.ts`, `packages/db/drizzle.config.ts` — Drizzle + Neon setup |
| 9 | **LastFM Import** | `apps/import/src/lastfm.ts` — Data ingestion pipeline |
| 10 | **Tooling** | `packages/eslint-config/base.js`, `ralph.sh` — Shared lint + automation |

---

## Complexity Hotspots

These files require extra care when modifying — they have the most logic, state management, or integration surface area:

| File | Why it's complex |
|---|---|
| **`sidebar.tsx`** (726 lines) | 25+ composable sub-components, React context provider, cookie-persisted state, keyboard shortcuts, mobile/desktop responsive |
| **`lastfm.ts`** (231 lines) | External API integration, 4-table upsert chain with conflict handling, environment variable management |
| **`chart.tsx`** (356 lines) | Recharts wrapper with theme-aware colors, custom tooltip/legend renderers, config-driven payload resolution |
| **`combobox.tsx`** (297 lines) | Filtering, chip selection, groups, scroll buttons — extensive sub-component API |
| **`calendar.tsx`** (221 lines) | Deep react-day-picker integration with range selection, locale formatting, custom day buttons |
| **`context-menu.tsx`** (271 lines) | Sub-menus, checkbox/radio items, keyboard shortcuts — full menu system |
| **`dropdown-menu.tsx`** (268 lines) | Same menu system pattern as context-menu but trigger-based |
| **`menubar.tsx`** (277 lines) | Delegates to dropdown-menu with menubar-specific styling overrides |
| **`alert-dialog.tsx`** (187 lines) | Full dialog with overlay, portal, media slot, size variants |

---

## File Map by Package

### `apps/web/` — Web Application

| File | Purpose |
|---|---|
| `app/layout.tsx` | Root layout — fonts, ThemeProvider, TooltipProvider, global CSS |
| `app/page.tsx` | Home page — minimal placeholder with heading + Button |
| `app/test/page.tsx` | UI showcase — demos Badge, Tabs, Card, Input, Switch, etc. |
| `components/theme-provider.tsx` | next-themes wrapper + `d` key dark mode toggle |

### `apps/import/` — Data Pipeline

| File | Purpose |
|---|---|
| `src/lastfm.ts` | Fetches LastFM scrobbles, upserts artists/albums/tracks/scrobbles |

### `packages/db/` — Database

| File | Purpose |
|---|---|
| `src/index.ts` | Creates Drizzle client connected to Neon via HTTP, exports `db` + `schema` |
| `src/schema.ts` | Star-schema tables: artists, albums, tracks, scrobbles in `listen` schema |
| `src/shared.ts` | `listen` schema namespace + timestamp column mixins |
| `drizzle.config.ts` | Drizzle Kit migration config (dialect, schema paths, output dir) |

### `packages/ui/` — Component Library (55 files)

All components live in `src/components/` and follow the cva + cn() + base-ui pattern. Key ones: **button** (core primitive), **sidebar** (most complex), **chart** (data viz), **dialog/sheet/drawer** (overlays), **command** (palette).

### `packages/eslint-config/` — Lint Rules

`base.js` → shared foundation; `next.js` extends it for Next.js apps; `react-internal.js` extends it for library packages.
