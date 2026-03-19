# Code Style & Formatting

## Prettier

Config lives in root `.prettierrc`. Key settings:

- No semicolons
- Double quotes
- 2-space indent, LF line endings
- Trailing commas (ES5)
- 80 char print width
- Tailwind class sorting via `prettier-plugin-tailwindcss` (respects `cn` and `cva`)

## TypeScript

- **Strict mode** enabled across all packages
- `noUncheckedIndexedAccess: true` — always handle possible `undefined` from index access
- Target: ES2022
- apps/web uses `moduleResolution: Bundler`, packages use `NodeNext`

## Path Aliases

| Alias | Resolves to | Used in |
|-------|-------------|---------|
| `@/*` | `./` (relative to apps/web) | apps/web only |
| `@workspace/ui/*` | `packages/ui/src/*` | Anywhere |

## ESLint

- Flat config format (ESLint 9)
- Shared configs in `packages/eslint-config/` (base, next-js, react-internal)
- All rules emit warnings only (`eslint-plugin-only-warn`)
- Prettier integration via `eslint-config-prettier`
