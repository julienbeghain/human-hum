# Architecture

## Monorepo Layout

```
human-hum/
├── apps/
│   └── web/                  # Next.js 16 app (App Router)
│       ├── app/              # Routes and layouts
│       ├── components/       # App-specific components
│       ├── hooks/            # App-specific hooks
│       └── lib/              # App-specific utilities
├── packages/
│   ├── ui/                   # Shared component library
│   │   └── src/
│   │       ├── components/   # shadcn/ui components (55)
│   │       ├── hooks/        # Shared hooks
│   │       ├── lib/          # Shared utilities (cn, etc.)
│   │       └── styles/       # Global CSS / Tailwind config
│   ├── eslint-config/        # Shared ESLint configs
│   └── typescript-config/    # Shared TS configs
```

## Task Orchestration (Turbo)

All tasks run via Turbo from the root. Task graph:

- `build` — depends on `^build`, caches `.next/**`
- `lint`, `format`, `typecheck` — depend on their `^` counterparts
- `dev` — no cache, persistent

## Dependency Flow

```
apps/web
  └── @workspace/ui (components, hooks, utils, styles)
  └── @workspace/eslint-config/next-js
  └── @workspace/typescript-config/nextjs.json

packages/ui
  └── @workspace/eslint-config/react-internal
  └── @workspace/typescript-config/react-library.json
```

## Key Design Decisions

- **UI package owns styles** — `globals.css` lives in `packages/ui`, apps import it
- **PostCSS shared** — apps/web re-exports PostCSS config from UI package
- **RSC by default** — components are server components unless marked `"use client"`
- **Turbopack for dev** — `next dev --turbopack` for fast local iteration
