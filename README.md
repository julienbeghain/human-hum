# Human Hum

Personal listening-history platform — records what you listen to from multiple sources and surfaces insights.

## Tech stack

- **Framework:** Next.js 16 (App Router)
- **Database:** Neon Serverless Postgres + Drizzle ORM
- **UI:** shadcn/ui + Tailwind CSS
- **Monorepo:** pnpm workspaces + Turborepo

## Structure

```
apps/
├── web/        → Next.js frontend
└── import/     → Bulk LastFM import script
packages/
├── db/         → Drizzle schema, client, migrations
├── ui/         → Shared UI components (shadcn)
├── eslint-config/
└── typescript-config/
```

## Getting started

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local  # add your Neon connection string
pnpm dev
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server |
| `pnpm build` | Production build |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Run Prettier |
| `pnpm typecheck` | TypeScript type checking |

## Architecture

Star-schema design: dimension tables (`artists`, `albums`, `tracks`) describe the catalog, a central fact table (`hums`) records listening events. Sources include LastFM, Spotify, and Tidal.

See [CONTEXT.md](CONTEXT.md) for domain language and [docs/adr/](docs/adr/) for architectural decisions.
