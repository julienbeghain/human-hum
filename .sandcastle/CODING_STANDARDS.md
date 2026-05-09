# Coding Standards

## Style

- TypeScript strict mode, no `any` types
- Use `cn()` from `@workspace/ui/lib/utils` for className merging
- Import UI components from `@workspace/ui/components/*`
- Import DB schema/client from `@workspace/db`

## Testing

- Run `pnpm typecheck && pnpm lint` before every commit
- Tests use Vitest with PGLite for database tests

## Architecture

- pnpm monorepo with workspaces
- Next.js 16 app in `apps/web`
- Shared DB package in `packages/db` (Drizzle ORM + Neon)
- Shared UI package in `packages/ui` (shadcn components)
- Domain language defined in `CONTEXT.md` — use canonical terms
