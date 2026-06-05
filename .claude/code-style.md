# Code Style & Formatting

Prettier (`.prettierrc`), ESLint (`packages/eslint-config/`), and TypeScript (`packages/typescript-config/`) configs are the source of truth. Read them directly — don't duplicate here.

## What the configs won't tell you

- **Strict TypeScript** is enforced across all packages, including `noUncheckedIndexedAccess` — always handle possible `undefined` from index access
- **Tailwind class sorting** via `prettier-plugin-tailwindcss` recognises `cn()` and `cva()` — classes inside these helpers are auto-sorted
- **All ESLint rules emit warnings only** (`eslint-plugin-only-warn`) — the CI gate is `pnpm lint`, not zero-warning builds

## TypeScript & Naming

- `type` over `interface` — reserve `interface` for declaration merging or class contracts
- No `any` — model the real shape (this is a hard preference, not a style nicety)
- Imports ordered: Next.js → React → 3rd-party → `@workspace/*` → relative
- UK English in identifiers and prose (`normalise`, `colour`, `behaviour`) — matches the schema and ADRs
- Files: `kebab-case.ts(x)`, named after the primary export — one unit of code per file

## Validation

**Zod 4 is the default for runtime validation** — reach for it at every trust boundary rather than hand-rolling checks. It's already a dependency in every package and used for external API responses (e.g. LastFM in `packages/db/src/lastfm-api.ts`).

Follow the same one-schema pattern core uses:

- **Define the schema once, derive the type** — `export type XValues = z.infer<typeof xSchema>`. The schema is the single source of truth; never maintain a parallel hand-written `type`.
- **Reuse that one schema across its boundaries** — server-action input validation, the React-Hook-Form form, and the inferred type all come from the same schema.
- **Keep schemas in dedicated validator modules**, not inline — colocated with the feature (e.g. `apps/web/lib/validators/`), mirroring core's `validators/` directory.
- **Complex or cross-field rules use `superRefine`** rather than chains of nested `.refine()`.
- Validate at the edge, then trust the parsed value inward.

## React Components

- Server components by default — add `"use client"` only when strictly necessary
- Props type declared directly above the component: `type [Name]Props = { ... }`
- `useEffect` is a last resort — derive from state/props or use event handlers first
- Stable keys — prefer stable IDs over array index (index only for static/append-only lists)
- Tailwind palette/token values only — no arbitrary hex/rgb (the design system is OKLch tokens, see [Component & UI Patterns](components.md))

## Quality

- Never `lint --fix` blindly — fix warnings manually so each change is intentional
- No `console.*` in committed code (debugging only) — surface failures by throwing with a message that includes context
- Error messages are detailed and carry the relevant identifiers/state

## Where Code Lives

| Type | Location |
|------|----------|
| Server actions | `apps/web/app/actions/` |
| App components | `apps/web/components/` |
| App helpers | `apps/web/lib/` |
| DB schema | `packages/db/src/schema.ts` |
| DB queries | `packages/db/src/queries/` |
| Shared UI | `packages/ui/src/components/` |
| Routing only (`page.tsx`, `layout.tsx`, etc.) | `apps/web/app/` |
