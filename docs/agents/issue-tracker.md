# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

How the `/wayfinder` skill's concepts map onto GitHub issues here.

- **Map** — an issue labelled `wayfinder:map`. Its body is the index (Notes · Decisions so far · Fog).
- **Ticket** — a child issue carrying a `## Parent` body line linking the map, plus one `wayfinder:<type>` label (`grilling` / `prototype` / `research` / `task`).
- **Parent link** — `## Parent` in the ticket body (mirrors the existing `#87`→`#88…91` convention). GitHub native sub-issues are not used.
- **Blocking** — a `## Blocked by` body line listing the ticket(s) that must close first (e.g. `- #94 — …`). A ticket is **unblocked** when every issue under its `## Blocked by` is closed.
- **Claim** — add the `wayfinder:claimed` label *before* any work, so concurrent sessions skip it.
- **Resolve** — post the answer as a comment, `gh issue close`, and append a one-line pointer to the map's *Decisions so far*.

**Find the map:** `gh issue list --label "wayfinder:map" --state open`

**Frontier query** (open, unblocked, unclaimed children of map `<M>`). GitHub `--search` mishandles `#<M>`, so match the map's URL in the body and filter with `jq`:

```bash
# open children of map <M> that are not yet claimed, with their type + blocked-by
gh issue list --state open --limit 100 --json number,title,body,labels \
  --jq ".[]
        | select(.body | test(\"issues/<M>\\\\)\"))
        | select([.labels[].name] | index(\"wayfinder:claimed\") | not)
        | {number, title,
           type:  ([.labels[].name] | map(select(startswith(\"wayfinder:\"))) | join(\",\")),
           blockedBy: ((.body | split(\"## Blocked by\")) | if length>1 then (.[1] | split(\"\\n## \")[0] | [scan(\"#[0-9]+\")]) else [] end)}"
# then drop any whose blocked-by still has an OPEN issue (check each: gh issue view <n> --json state).
```

Take the lowest-numbered survivor as the next frontier ticket.
