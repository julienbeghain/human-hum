# Agent Workflow

Work management uses three layers.

## Layers

1. **GitHub Issues** — epics and sub-issues. Agents create, comment, and close these via `/feature-workflow` and `/gh-edit-body`. The human owns the backlog and PRD-level decisions.
2. **Beads (`bd`)** — the agent work queue. Each GitHub issue is decomposed into small tasks with dependencies. Agents operate here for day-to-day task tracking.
3. **Ralph** — a bash loop that spawns fresh Claude Code instances. Each instance picks one Beads task, implements it, commits, and exits. Fresh context window every iteration.

```
GitHub Issue #43 ("Album enrichment")
  ├── Beads task: schema migration
  ├── Beads task: enrichment module (blocked by above)
  ├── Beads task: query integration (blocked by above)
  └── Beads task: artwork display (blocked by above)

All Beads tasks done → agent closes GitHub sub-issues → human closes epic
```

## Session protocol

1. **Start:** `bd ready` — this is your task queue
2. **Claim:** `bd update <id> --claim`
3. **Implement:** one task per context window, never multiple
4. **Verify:** `pnpm typecheck && pnpm lint` before committing
5. **Commit:** conventional commit message
6. **Close:** `bd close <id> --reason "summary of work done"`
7. **Push:** `git push` before ending

## Discovering unplanned work

If you find work that's needed but not in the queue:

```bash
bd create --title="Found a bug in X" --description="Details about what was found" --type=bug --priority=1
```

## Persistent memory

Use `bd remember "insight"` to store knowledge that survives across sessions. Search with `bd memories <keyword>`.
