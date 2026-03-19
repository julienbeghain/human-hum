# Component & UI Patterns

## shadcn/ui

- **Style:** `base-maia`
- **Icon library:** Tabler (`@tabler/icons-react`)
- **React Server Components:** enabled (`rsc: true`)
- Base components are installed in `packages/ui/src/components/`

### Adding Components

Shared (reusable) components go in the UI package:
```bash
pnpm dlx shadcn@latest add <component> -c packages/ui
```

App-specific components go in the web app:
```bash
pnpm dlx shadcn@latest add <component> -c apps/web
```

### Importing

```tsx
// UI package components
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { useMobile } from "@workspace/ui/hooks/use-mobile"
```

## Tailwind CSS v4

- Config is CSS-based (`packages/ui/src/styles/globals.css`), not `tailwind.config.js`
- Color system uses **OKLch** color space
- apps/web imports styles via `@workspace/ui/globals.css`
- Both packages share the same PostCSS config (`@tailwindcss/postcss`)

## Theming

- Dark mode via `next-themes` (class strategy)
- `ThemeProvider` wraps the app in `apps/web/app/layout.tsx`
- Press `d` to toggle dark mode (custom hotkey in `theme-provider.tsx`)
- `TooltipProvider` wraps the app for tooltip support

## Fonts

- **Sans:** Geist (`--font-sans`)
- **Mono:** JetBrains Mono (`--font-mono`, used as default body font)
