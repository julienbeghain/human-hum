# Task

Implement issue #{{TASK_ID}}: {{ISSUE_TITLE}}

Pull in the full issue details:

<issue>
!`gh issue view {{TASK_ID}} --comments`
</issue>

Work on branch {{BRANCH}}.

# Context

- Read `CLAUDE.md` for project conventions
- Read `CONTEXT.md` for domain language — use canonical terms
- This is a pnpm monorepo: `apps/web` (Next.js), `packages/db` (Drizzle), `packages/ui` (shadcn)

# Execution

Follow Red-Green-Refactor:
1. **RED** — Write a failing test that captures the requirement
2. **GREEN** — Write the minimum code to make it pass
3. **REFACTOR** — Clean up while keeping tests green
4. Repeat for each sub-requirement

# Quality gates

Before committing, run:
```
pnpm typecheck && pnpm lint
```

# Commits

Conventional commit format, imperative and lowercase. Reference the issue with a `Refs` footer so
`git log` ↔ issue stays linked. **No tool-name prefix, no `Co-Authored-By` / AI attribution.**
```
feat(db): add artist lookup by mbid

Refs #{{TASK_ID}}
```

# Done

Once the issue is fully implemented and all quality gates pass, output:

<promise>COMPLETE</promise>

Work on a single issue only — do not pick up additional work.
