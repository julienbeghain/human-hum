# Graphify evaluation

Evaluation of [graphify](https://github.com/safishamsi/graphify) (`graphifyy` v0.8.33, MIT)
run against this repository on 2026-06-06.

## What it is

A Python CLI that turns a repo into a queryable knowledge graph. Code is parsed
locally with tree-sitter (28+ languages, zero tokens/cost); docs, PDFs, and images
get semantic extraction from an LLM. The notable design choice: **the host coding
agent is the LLM backend** — graphify reads no provider API key, it dispatches
subagents and merges their structured output. Outputs land in `graphify-out/`:
`graph.json` (GraphRAG context), `graph.html` (interactive viz), `GRAPH_REPORT.md`.

Install: `uv tool install graphifyy`. Run via the `/graphify` skill or the `graphify`
CLI (`query`, `path`, `explain`, `diagnose`, `update`, `hook install`, ...).

## Run on this repo

| Stage | Result |
| --- | --- |
| Detect | 173 files (143 code, 30 docs), ~58k words |
| AST extraction (local, free) | 1,951 nodes / 3,550 edges |
| Semantic layer (2 doc subagents) | 120 nodes / 155 edges / 6 hyperedges |
| Final graph (post-build) | 2,071 nodes / 2,902 edges / 168 communities |
| Audit mix | 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS |
| `diagnose multigraph` | 0 dangling · 0 duplicate · 0 collapsed edges |

## Strengths

- **Accurate hub detection.** Top god-nodes were `cn()` (303 edges — imported by
  every UI component), the four core domain tables (`scrobbles`/`tracks`/`albums`/
  `artists`), `getScrobbles()`, and `buildFilterConditions()` — a correct read of
  the codebase's real centers of gravity.
- **`path` and `explain` are reliable and deterministic.** `path "cn()" "scrobbles"`
  returned a real 5-hop import chain; `explain "recordListen()"` produced an accurate
  call graph (called by `importScrobbles()`; calls `normalizeMbid()`/`resolveEntity()`).
- **The semantic layer adds value over AST/grep.** It linked `AGENTS.md`'s "Landing
  the Plane" to `.claude/agent-workflow.md`, `architecture.md`'s schema concept to
  ADR-0002, and frontend pages to their backend query functions across the app/db
  boundary — cross-cutting edges structural parsing can't find.
- **Honest audit trail** (EXTRACTED/INFERRED/AMBIGUOUS per edge) and **local-only
  code parsing** (code never leaves the machine; the heavy step is free).

## Weaknesses

- **Drizzle migration snapshots become noise.** `drizzle/meta/*.json` snapshots
  explode into hundreds of granular nodes and several near-duplicate communities.
  Mitigated by the `.graphifyignore` added in this commit.
- **NL queries depend on keyword start-node matching.** "What happens during a
  Last.fm import?" collided with the code token `import` (2 nodes); phrasing with
  concrete symbols ("lastfm fetcher pagination") found 35 relevant nodes.
- **Over-segmentation:** 168 communities for a repo this size; most are small and
  unnamed in the report.
- **Operational friction:** the pipeline is multi-step and one extraction subagent
  silently no-op'd on first dispatch, requiring a manual re-run.

## Verdict

A qualified yes — adopt it as an **agent-facing code-navigation layer**, not as
human-readable docs. `path`/`explain`/god-node detection are trustworthy today; the
semantic doc-linking is worthwhile for this ADR- and agent-workflow-heavy repo.
Recommended setup: keep the `.graphifyignore` here, and use `graphify hook install`
to refresh the code graph on commit (that path needs no LLM).
