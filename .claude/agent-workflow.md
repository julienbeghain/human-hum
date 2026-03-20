# Agent Workflow

Work management uses three layers. Claude Code operates at the Beads layer only.

## Layers

1. **GitHub Issues** — epics (11 total, across 8 phases). The human creates and closes these. Claude Code never touches GitHub issues.
2. **Beads (`bd`)** — the agent work queue. Each GitHub issue is decomposed into small tasks with dependencies.
3. **Ralph** — a bash loop that spawns fresh Claude Code instances. Each instance picks one Beads task, implements it, commits, and exits. Fresh context window every iteration.

```
GitHub Issue #1 ("Set up packages/db")
  ├── Beads task: init package.json + tsconfig
  ├── Beads task: install drizzle + neon driver (blocked by above)
  ├── Beads task: create client.ts (blocked by above)
  └── Beads task: test connection script (blocked by above)

All Beads tasks done → human closes GitHub Issue #1
```

## Session protocol

1. **Start:** `bd ready --json` — this is your task queue
2. **Claim:** `bd update <id> --claim --json`
3. **Implement:** one task per context window, never multiple
4. **Verify:** `pnpm typecheck && pnpm lint` before committing
5. **Commit:** conventional commit message
6. **Learn:** append learnings to `progress.txt`
7. **Close:** `bd close <id> --reason "Done" --json`
8. **Sync:** `bd sync` before ending

## Discovering unplanned work

If you find work that's needed but not in the queue: `bd create "description" --json`
