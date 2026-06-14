# Git Workflow

Solo project. Main is always deployable. Commit directly to `main` for everyday work; reach for a feature branch + PR only when a larger change benefits from review or CI gating.

## Branch Rules

- **Direct commits/pushes to `main` are allowed** — feature branches + PRs are optional
- **Never force-push to `main`**
- Branch naming: `<type>/<short-description>` (e.g., `feat/db-setup`, `fix/sidebar-hydration`)
- Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`
- One concern per branch — don't mix unrelated changes

## PR Workflow (optional)

When you do choose a PR for a larger change:

1. Create a feature branch from `main`
2. Make commits (conventional commit messages, see below)
3. Push branch and open a PR with a clear title and description
4. PR must pass CI checks before merging (lint, typecheck, build)
5. Squash-merge into `main` — keeps history clean
6. Delete the branch after merge

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

- **type**: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `perf`
- **scope**: package or area affected (`web`, `ui`, `db`, `import`, `config`)
- **description**: imperative mood, lowercase, no period
- **No Co-Authored-By trailers** — do not add `Co-Authored-By: Claude` or any AI attribution to commit messages
- Examples:
  - `feat(db): add hum schema and query functions`
  - `fix(ui): resolve sidebar hydration mismatch`
  - `chore(config): add eslint rule for import order`

## What Belongs in One PR

- A single issue or a single logical change
- If a change touches multiple packages, that's fine — but the change should have one purpose
- Don't bundle "while I was here" cleanups with feature work — separate PRs

## Release / Deploy

- Merging to `main` = deployable
- Tag releases when meaningful milestones are reached (e.g., `v0.1.0` after phase 1)
