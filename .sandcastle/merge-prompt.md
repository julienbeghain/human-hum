# Task

Merge the following branches into the current branch:

{{BRANCHES}}

# Process

For each branch:
1. `git merge --no-edit <branch>`
2. If conflicts arise, resolve them sensibly
3. Run `pnpm typecheck && pnpm lint && pnpm test` to verify
4. If checks fail, fix the issues and commit

# Record the result, then close

For each merged issue:

{{ISSUES}}

The issue body is the result-of-record — **do not leave a closing comment.** Instead, append a dated
`Result` section to the issue **body** and tick its acceptance criteria, then close it:

1. `gh issue view <number> --json body --jq .body` → current body
2. Append a section (what shipped in result terms; key decisions + why; merge commit SHA), tick the
   `- [ ]` criteria to `- [x]`, and write the new body via a temp file:
   `gh issue edit <number> --body-file /tmp/issue-<number>.md`
3. `gh issue close <number>`

# Done

Once all branches are merged and issues closed, output:

<promise>COMPLETE</promise>
