# Context

Here are the ready-to-work issues (no blockers):

<issues>
!`gh issue list --state open --label ready-for-agent --json number,title,body,labels --jq '[.[] | {number, title, body, labels: [.labels[].name]}]'`
</issues>

# Task

Analyze the ready issues and build a dependency graph. Select up to 4 issues that can be worked on in parallel without conflicts.

For each selected issue, assign a branch name using the format `sandcastle/issue-{number}-{slug}`.

Prioritise by priority number (0 = critical, 4 = backlog). Prefer issues that touch different areas of the codebase to minimise merge conflicts.

# Output

Output your plan as a JSON object wrapped in `<plan>` tags:

```
<plan>
{"issues": [{"id": "human-hum-abc", "title": "Fix auth bug", "branch": "sandcastle/issue-human-hum-abc-fix-auth-bug"}]}
</plan>
```

If there are no issues ready to work on, output:

```
<plan>
{"issues": []}
</plan>
```
