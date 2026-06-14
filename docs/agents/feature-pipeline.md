# Feature pipeline

The one canonical workflow for every Human Hum feature. The generic feature skills
(`/grill*`, `/to-prd`, `/prd-to-plan`, `/to-issues`, `/gh-to-beads`, `/feature-dev`,
`/feature-workflow`, `/gh-edit-body`, `/handoff`) are upstream primitives; when they run **in
this repo, this doc overrides their defaults at runtime** — the same docs-as-authority mechanism
as [triage-labels.md](triage-labels.md) (no skill files are ever edited).

This is a **solo project**, which changes one thing versus a team pipeline: **there is no reviewer.**
Nothing here is written *for* a human reviewer or a bot. The durable record exists for **future-you
and a returning agent** — to reconstruct the narrative and the *why* after long pauses between
sessions. Implementation is done by an agent session; the pipeline is agnostic to what drives it.

## The pipeline

```
/grill-with-docs ─► design locked; CONTEXT.md / ADR updated (tracked, in-repo)
/to-prd          ─► EPIC issue on GitHub  (the durable spec + why; label ready-for-human)
/prd-to-plan     ─► PLAN with vertical slices  (local: agent-context/plans/*.md, gitignored)
/to-issues       ─► leaf slices become bd tasks  (the execution queue; blocked-by = ordering)
/gh-to-beads     ─► bd mirror of the epic (thin pointer to the GH issue; no spec duplication)
/feature-dev     ─► IMPLEMENT one slice → bd notes = raw JOURNEY → commit to main (Refs #epic)
slice close      ─► distill journey → RESULT section in the GH issue body (/gh-edit-body)
                    all slices done → close the epic; the issue now reads spec → decisions → result
```

The GitHub epic is the single durable home per feature. Leaf work lives in **bd**, not as native
GitHub sub-issues — a solo dev doesn't need the sub-issue/rollup ceremony. Promote a slice to its
own GitHub issue only when it is substantial enough to deserve its **own** documented Result.

## Why a mirror at all — the memory problem

**bd is volatile.** `.beads/` is gitignored and re-imported from `issues.jsonl` on each run, and the
DB can be wiped for a change of direction (by design). So **anything that lives only in bd notes is
lost** on a wipe or simply forgotten across a long pause. The mirror to GitHub is not bureaucracy —
it is the act of **graduating a decision from volatile → durable before the work closes**, so the
returning reader can recover it.

| Layer | Home | Tracked? | Holds | Lifetime |
|---|---|---|---|---|
| **bd issue/notes** | local `.beads/` | no (gitignored, re-imported, wipeable) | raw live **journey** — what I tried, dead-ends, current state | volatile; carried across conversations via `/handoff` |
| **GitHub issue body** | GitHub | yes | **spec → decision trace → Result snapshot** | durable; the thing future-you/agent reads first |
| **ADR** (`docs/adr/`) | repo | yes | a cross-cutting design decision + its *why* | durable; referenced from the issue |
| **CONTEXT.md** | repo | yes | shared domain vocabulary | durable |
| **agent-context/** (plans, handoffs) | local | no (gitignored) | working plan + session handoff | local-only, working memory |

Reading rules that follow from this:

- **bd is a thin pointer + journey, not a second spec.** The spec lives in the GitHub issue, once.
  Never mirror the GH spec into bd — it only burns agent context tokens. Keep bd notes terse.
- **bd↔GH divergence is by design, not drift.** bd's title/description are local labels keyed to the
  GH issue; they may lag GitHub after a PRD rewrite. GitHub is the sole spec source — never report bd
  as "stale," never reconcile it back to GitHub. Just keep logging the journey.
- **Before a slice closes, the durable `why` must leave bd.** A non-trivial decision graduates to the
  GH issue body Result section (per-feature narrative) or to an ADR (cross-cutting). If it stays only
  in bd notes, treat it as not yet recorded.

## Result-of-record — no PR

This is a solo project: everyday work **commits directly to `main`**; a feature branch + PR is
optional and reserved for a larger change that genuinely benefits from CI gating
([git-workflow.md](../../.claude/git-workflow.md)). Because there is usually no PR, **the GitHub
issue body is the result-of-record** — it absorbs the job a PR body would do on a team.

At each meaningful close, use `/gh-edit-body` to fold a dated **Result** entry into the feature's
issue and tick its acceptance criteria. Shape:

```
## Spec            — what & why (from /to-prd; the stable top of the issue)
## Decisions       — key choices + WHY, self-contained prose (link an ADR if cross-cutting)
## Result <date>   — what shipped, in result terms; commit SHA(s); criteria ticked
```

- **Bind code to the narrative.** Commits use a `Refs #<epic>` footer (or `(#<epic>)` in the
  subject) so `git log` ↔ issue stays linked without a PR. Use `Closes #<epic>` on the commit that
  finishes the feature.
- **Read top-to-bottom, the closed issue is the snapshot** a returning agent/you recover from:
  spec → decisions → result. That is the whole point of the pipeline.
- **Commit messages:** conventional commits, imperative, lowercase. **No `Co-Authored-By` / AI
  attribution** ([git-workflow.md](../../.claude/git-workflow.md#L37)).

## Labels — agent vs human

`/to-prd` and `/to-issues` apply triage labels; the precise strings and the decision guide live in
[triage-labels.md](triage-labels.md).

- **Epics / PRDs** → `ready-for-human` (they spawn work; they are not themselves implemented).
- **Fully-specified leaf slices** → `ready-for-agent` (concrete criteria, no design or external
  setup left to decide — an agent session can implement it as written).
- A slice needing design, external setup, or a judgment call → `ready-for-human`.

## Overrides to generic skill defaults

When one of these skills runs in this repo, apply the **Human Hum override** over the skill's own
defaults — same lever as [triage-labels.md](triage-labels.md).

| Skill | Generic default | Human Hum override |
|---|---|---|
| `/grill*` | either grill skill | **use `/grill-with-docs`** (maintains CONTEXT.md / ADRs) |
| `/to-prd` | one tracker, generic label | publish the **epic to GitHub**; label `ready-for-human` |
| `/prd-to-plan` | plan to disk | plan to `agent-context/plans/*.md` (gitignored); pick slice granularity here |
| `/to-issues` | creates issues on the GitHub tracker | leaf slices become **bd tasks**, not native GH sub-issues; encode ordering as bd `blocked-by`; label `ready-for-agent` |
| `/gh-to-beads` IMPORT | mirrors a GH tree | mirror the **epic only** — a thin pointer to the GH issue, never the spec text |
| `/feature-dev` | bd notes ad hoc | bd notes = **the journey log**; at slice close → Result section in the GH issue body |
| `/gh-to-beads` SYNC-BACK / `/gh-edit-body` | may post a comment | **no comment**; fold the distilled Result + ticked criteria into the **issue body** |
| `/feature-workflow` | ends in a PR; may include `/notion-backup` | result-of-record is the **issue body**, not a PR; **no Notion** |
| `/check-progress` | reads plan/issues | completion signal = bd queue drained **and** the epic's Result section written |
| `/handoff` | writes a handoff file | carries the volatile bd journey across conversations; file stays **local** (gitignored) |

## Runbook (stage by stage)

1. **Grill** — `/grill-with-docs`. Lock the design; update CONTEXT.md / ADRs as decisions crystallise.
2. **PRD** — `/to-prd` publishes the epic as a GitHub issue (spec + why). Label `ready-for-human`.
3. **Plan** — `/prd-to-plan` writes the slice plan to `agent-context/plans/*.md`. Pick granularity here.
4. **Queue** — `/to-issues` turns slices into bd tasks; `/gh-to-beads` adds the thin epic pointer.
   Label leaf tasks `ready-for-agent`; wire `blocked-by` for ordering.
5. **Implement** — `/feature-dev` on one slice. Log the journey to bd notes as you go.
   Run `pnpm typecheck && pnpm lint`. Commit to `main` (or a branch, if large) with `Refs #<epic>`.
6. **Slice close** — `/gh-edit-body`: distil the bd journey into a dated **Result** entry in the GH
   issue body, tick the criteria. Close the bd task with a one-line reason.
7. **Feature close** — when the bd queue is drained and the issue's Result reads cleanly,
   `Closes #<epic>` on the final commit (or close the issue by hand).

## See also

- [agent-workflow.md](../../.claude/agent-workflow.md) — the work-management layers (GitHub → Beads).
- [issue-tracker.md](issue-tracker.md) — GitHub `gh` conventions.
- [triage-labels.md](triage-labels.md) — the role→label table and the agent/human guide.
- [git-workflow.md](../../.claude/git-workflow.md) — direct-to-main, optional PRs, commit rules.
