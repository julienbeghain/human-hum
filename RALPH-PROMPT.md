# Instructions

Read CLAUDE.md for project context.
Read progress.txt for learnings from previous iterations.
Check bd ready for the next unblocked task.

## Your Task
1. Find the highest-priority incomplete task
2. Implement ONLY that single task
3. Run quality checks: pnpm typecheck && pnpm lint
4. If checks pass, commit with conventional commit format
5. Mark the task complete (bd close <id> --reason "Done")
6. Append what you learned to progress.txt
7. If ALL tasks are complete, output: <promise>COMPLETE</promise>

## Rules
- Only work on ONE task per iteration
- Always run checks before committing
- Never skip quality checks
- Server Components by default; 'use client' only for interactivity
- All DB access through Drizzle ORM, never raw SQL
