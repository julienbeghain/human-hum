# Task

Merge the following branches into the current branch:

{{BRANCHES}}

# Process

For each branch:
1. `git merge --no-edit <branch>`
2. If conflicts arise, resolve them sensibly
3. Run `pnpm typecheck && pnpm lint` to verify
4. If checks fail, fix the issues and commit

# Close issues

After successful merge, close the corresponding GitHub issues:

{{ISSUES}}

Use `gh issue close <number> --comment "Implemented and merged by Sandcastle"` for each.

# Done

Once all branches are merged and issues closed, output:

<promise>COMPLETE</promise>
