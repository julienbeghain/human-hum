# Feature pipeline

The one canonical workflow for every Human Hum feature. The generic feature skills
(`/grill*`, `/to-prd`, `/prd-to-plan`, `/to-issues`, `/gh-to-beads`, `/feature-dev`,
`/feature-workflow`, `/gh-edit-body`, `/handoff`) are upstream primitives; when they run **in
this repo, this doc overrides their defaults at runtime** — the same docs-as-authority mechanism
as [triage-labels.md](triage-labels.md) (no skill files are ever edited).

This is a **solo project**, which changes one thing versus a team pipeline: **there is no reviewer.**
Nothing here is written *for* a human reviewer or a bot. The durable record exists for **future-you
and a returning agent** — to reconstruct the narrative and the *why* after long pauses between
sessions.

## The two trackers

- **GitHub issue = the work queue *and* the durable record.** A GitHub issue is the unit of work.
  Its body is the spec; an agent picks it up; its body becomes the result snapshot on close.
- **bd = the local working layer.** The volatile journey (`bd update --notes`), the dependency
  graph, and persistent memory (`bd remember`) — carried across conversations via `/handoff`. bd is
  **not** the queue and asserts no spec; it tracks *how the work is going*, keyed to the GitHub issue
  by `external_ref`.

A leaf-sized GitHub issue labelled **`ready-for-agent`** is the thing an agent (or sandcastle) picks
up. Epics/PRDs stay `ready-for-human` and spawn the leaf issues; they are never implemented directly.

## The pipeline

```
/grill-with-docs ─► design locked; CONTEXT.md / ADR updated (tracked, in-repo)
/to-prd          ─► EPIC issue on GitHub      (durable spec + why; label ready-for-human)
/prd-to-plan     ─► PLAN with vertical slices (local: agent-context/plans/*.md, gitignored)
/to-issues       ─► LEAF issues on GitHub     (the queue; label ready-for-agent; Blocked by #N = order)
implement        ─► one issue → one branch → commit (Refs #issue) → review gate
issue close      ─► distill journey → RESULT section in the issue body (/gh-edit-body) → close
```

Leaf work is a **GitHub issue**, not a bd task — the queue lives on GitHub so both a hand-driven
agent session and the optional sandcastle engine read the same source (`gh issue list --label
ready-for-agent`). bd mirrors the issue you are *actively* working as a thin pointer + journey; it is
never a second queue.

## Two ways to run the Implement→close stages

The pipeline above is identical either way. **By hand is the default and always available;
sandcastle is an optional accelerator — nothing requires it.**

### By hand (default)

`/feature-dev` on one `ready-for-agent` issue: read the issue + `CLAUDE.md` + `CONTEXT.md`, implement
on a branch (or straight to `main` for a small change — [git-workflow.md](../../.claude/git-workflow.md)),
log the journey to bd notes, run `pnpm typecheck && pnpm lint`, then close (below). Use bd +
`/handoff` to carry context across a long pause.

### With sandcastle (optional)

[.sandcastle/main.mts](../../.sandcastle/main.mts) batches up to 4 `ready-for-agent` issues in
parallel, each in an isolated Docker worktree, through four roles:

```
Planner    ─► reads ready-for-agent issues → <plan> JSON {number, title, branch}
Implementer ─► one issue per sandbox → implement-prompt.md → commits on the branch
Reviewer    ─► review-prompt.md → <verdict>PASS|FAIL</verdict>   ← the gate
Merger      ─► merges PASS branches → writes Result to each issue body → closes the issue
```

The **review gate** is load-bearing: a `FAIL` (or a missing verdict, or zero commits) keeps the
branch **out of the merge set** — bad work never lands. sandcastle skips the bd journal entirely; its
durable trace is the GitHub issue body it writes on close, exactly like the hand path.

## Why a durable record at all — the memory problem

**bd is volatile.** `.beads/` is gitignored and re-imported from `issues.jsonl` on each run, and the
DB can be wiped for a change of direction (by design). So **anything that lives only in bd notes is
lost** on a wipe or simply forgotten across a long pause. The GitHub issue and tracked ADRs are the
durable layer; the act that matters is **graduating a decision from volatile → durable before the
issue closes**, so the returning reader can recover it.

| Layer | Home | Tracked? | Holds | Lifetime |
|---|---|---|---|---|
| **GitHub issue body** | GitHub | yes | **spec → decision trace → Result snapshot**; also the queue | durable; read first by a returning agent |
| **bd issue/notes** | local `.beads/` | no (gitignored, re-imported, wipeable) | raw live **journey** + deps + `bd remember` memory | volatile; carried across conversations via `/handoff` |
| **ADR** (`docs/adr/`) | repo | yes | a cross-cutting design decision + its *why* | durable; referenced from the issue |
| **CONTEXT.md** | repo | yes | shared domain vocabulary | durable |
| **agent-context/** (plans, handoffs) | local | no (gitignored) | working plan + session handoff | local-only, working memory |

Reading rules that follow:

- **bd is a thin pointer + journey, not a second spec or a second queue.** The spec and the queue
  both live on GitHub. Never mirror the GH spec into bd — it only burns agent context tokens.
- **bd↔GH divergence is by design, not drift.** bd's title/description are local labels keyed to the
  GH issue; they may lag GitHub after a PRD rewrite. Never report bd as "stale," never reconcile it
  back to GitHub. Just keep logging the journey.
- **Before an issue closes, the durable `why` must leave bd** — into the issue body Result section
  (per-feature narrative) or an ADR (cross-cutting). If it stays only in bd notes, it is not recorded.

## Result-of-record — no PR

This is a solo project: everyday work **commits directly to `main`**; a feature branch + PR is
optional and reserved for a larger change that benefits from CI gating
([git-workflow.md](../../.claude/git-workflow.md)). The sandcastle path uses a branch per issue and
merges it; either way **the GitHub issue body is the result-of-record** — it does the job a PR body
would on a team.

At close, fold a dated **Result** entry into the issue body (`/gh-edit-body`, **never a comment**) and
tick its acceptance criteria. Shape:

```
## Spec            — what & why (from /to-prd; the stable top of the issue)
## Decisions       — key choices + WHY, self-contained prose (link an ADR if cross-cutting)
## Result <date>   — what shipped, in result terms; commit SHA(s); criteria ticked
```

- **Bind code to the narrative.** Commits use a `Refs #<issue>` footer (or `(#<issue>)` in the
  subject) so `git log` ↔ issue stays linked. Conventional commits, imperative, lowercase. **No
  `Co-Authored-By` / AI attribution and no tool-name prefixes** ([git-workflow.md](../../.claude/git-workflow.md#L37)).
- **Read top-to-bottom, the closed issue is the snapshot** a returning agent/you recover from:
  spec → decisions → result. That is the whole point of the pipeline.

## Labels — agent vs human

`/to-prd` and `/to-issues` apply triage labels; the strings and the decision guide live in
[triage-labels.md](triage-labels.md).

- **Epics / PRDs** → `ready-for-human` (they spawn work; they are not themselves implemented).
- **Fully-specified leaf issues** → `ready-for-agent` (concrete criteria, no design or external setup
  left to decide). This label *is* the queue — the hand path and sandcastle both read it.
- A leaf needing design, external setup, or a judgment call → `ready-for-human`.

## Overrides to generic skill defaults

When one of these skills runs in this repo, apply the **Human Hum override** — same lever as
[triage-labels.md](triage-labels.md).

| Skill | Generic default | Human Hum override |
|---|---|---|
| `/grill*` | either grill skill | **use `/grill-with-docs`** (maintains CONTEXT.md / ADRs) |
| `/to-prd` | one tracker, generic label | publish the **epic to GitHub**; label `ready-for-human` |
| `/prd-to-plan` | plan to disk | plan to `agent-context/plans/*.md` (gitignored); pick slice granularity here |
| `/to-issues` | generic issues | leaf **GitHub issues** labelled `ready-for-agent`; ordering via `Blocked by #N` |
| `/gh-to-beads` IMPORT | mirrors a GH tree | mirror **only the issue you are actively working** — a thin pointer + journey, never the spec text, never the whole queue |
| `/feature-dev` | bd notes ad hoc | bd notes = **the journey log**; at close → Result section in the GH issue body |
| `/gh-edit-body` | may post a comment | **no comment**; fold the distilled Result + ticked criteria into the **issue body** |
| `/feature-workflow` | ends in a PR; may include `/notion-backup` | result-of-record is the **issue body**, not a PR; **no Notion**; sandcastle is an optional executor |
| `/check-progress` | reads plan/issues | completion signal = the issue's Result section written and the issue closed |
| `/handoff` | writes a handoff file | carries the volatile bd journey across conversations; file stays **local** (gitignored) |

## Runbook (stage by stage)

1. **Grill** — `/grill-with-docs`. Lock the design; update CONTEXT.md / ADRs as decisions crystallise.
2. **PRD** — `/to-prd` publishes the epic as a GitHub issue (spec + why). Label `ready-for-human`.
3. **Plan** — `/prd-to-plan` writes the slice plan to `agent-context/plans/*.md`. Pick granularity here.
4. **Queue** — `/to-issues` creates leaf **GitHub issues** labelled `ready-for-agent`; encode ordering
   with `Blocked by #N`.
5. **Implement** — pick a `ready-for-agent` issue. **By hand:** `/feature-dev`, journey to bd notes.
   **Or sandcastle:** run `.sandcastle/main.mts` to batch in parallel. Either way: one issue → one
   branch (or `main` if small), `pnpm typecheck && pnpm lint`, commit with `Refs #<issue>`.
6. **Review gate** — a change merges only if review passes (sandcastle enforces this via the
   `<verdict>` gate; by hand, self-review against [CODING_STANDARDS.md](../../.sandcastle/CODING_STANDARDS.md)).
7. **Close** — `/gh-edit-body`: distil the journey into a dated **Result** entry in the issue body,
   tick the criteria, then close the issue.

## See also

- [agent-workflow.md](../../.claude/agent-workflow.md) — the work-management layers.
- [issue-tracker.md](issue-tracker.md) — GitHub `gh` conventions.
- [triage-labels.md](triage-labels.md) — the role→label table and the agent/human guide.
- [git-workflow.md](../../.claude/git-workflow.md) — direct-to-main, optional PRs, commit rules.
- [.sandcastle/main.mts](../../.sandcastle/main.mts) — the optional parallel executor.
