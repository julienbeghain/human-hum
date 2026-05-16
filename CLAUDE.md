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

## Rules

- Run `pnpm typecheck && pnpm lint` before every commit
- One Beads task per context window — see [Agent Workflow](.claude/agent-workflow.md)

## Guidelines

- [Agent Workflow](.claude/agent-workflow.md)
- [Git Workflow](.claude/git-workflow.md)
- [Code Style & Formatting](.claude/code-style.md)
- [Component & UI Patterns](.claude/components.md)
- [Architecture](.claude/architecture.md)
- [Deep Module Principles](.claude/deep-modules.md)
- [Domain Language](CONTEXT.md)

## Agent skills

### Issue tracker

Issues are tracked as GitHub Issues on julienbeghain/human-hum. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout. Domain language in `CONTEXT.md`. See `docs/agents/domain.md`.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:b9766037 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
