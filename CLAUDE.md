# Human Hum

A personal music scrobbling platform — records listening history and surfaces insights. Built as a pnpm monorepo with Next.js 16, Drizzle ORM, and Neon Postgres.

## Commands

- **Dev:** `pnpm dev`
- **Build:** `pnpm build`
- **Lint:** `pnpm lint`
- **Format:** `pnpm format`
- **Typecheck:** `pnpm typecheck`

## Key Conventions

- **Package manager:** pnpm (v9, workspaces)
- **Import UI components:** `import { X } from "@workspace/ui/components/x"`
- **Import DB schema/client:** `import { db, schema } from "@workspace/db"`
- **Add shadcn components:** `pnpm dlx shadcn@latest add <component> -c packages/ui`
- **Utility function:** `cn()` from `@workspace/ui/lib/utils`

## Guidelines

- [Git Workflow](.claude/git-workflow.md)
- [Code Style & Formatting](.claude/code-style.md)
- [Component & UI Patterns](.claude/components.md)
- [Architecture](.claude/architecture.md)
- [Deep Module Principles](.claude/deep-modules.md)
- [Domain Language](UBIQUITOUS_LANGUAGE.md)
