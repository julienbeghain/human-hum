# Code Style & Formatting

Prettier (`.prettierrc`), ESLint (`packages/eslint-config/`), and TypeScript (`packages/typescript-config/`) configs are the source of truth. Read them directly — don't duplicate here.

## What the configs won't tell you

- **Strict TypeScript** is enforced across all packages, including `noUncheckedIndexedAccess` — always handle possible `undefined` from index access
- **Tailwind class sorting** via `prettier-plugin-tailwindcss` recognises `cn()` and `cva()` — classes inside these helpers are auto-sorted
- **All ESLint rules emit warnings only** (`eslint-plugin-only-warn`) — the CI gate is `pnpm lint`, not zero-warning builds
