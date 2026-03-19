# Human Hum

A shadcn/ui monorepo — Next.js 16 app with a shared React component library.

## Commands

- **Dev:** `pnpm dev`
- **Build:** `pnpm build`
- **Lint:** `pnpm lint`
- **Format:** `pnpm format`
- **Typecheck:** `pnpm typecheck`

## Monorepo Structure

| Package | Path | Purpose |
|---------|------|---------|
| `apps/web` | Next.js 16 app (React 19, Turbopack) | Consumer app |
| `packages/ui` | Shared component library (shadcn/ui) | Reusable UI |
| `packages/eslint-config` | Shared ESLint flat configs | Linting |
| `packages/typescript-config` | Shared TS configs | Type checking |

## Key Conventions

- **Package manager:** pnpm (v9, workspaces)
- **Import UI components:** `import { X } from "@workspace/ui/components/x"`
- **Add shadcn components:** `pnpm dlx shadcn@latest add <component> -c packages/ui`
- **Utility function:** `cn()` from `@workspace/ui/lib/utils`

## Guidelines

- [Code Style & Formatting](.claude/code-style.md)
- [Component & UI Patterns](.claude/components.md)
- [Architecture](.claude/architecture.md)
