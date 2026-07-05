# Task

Review the code changes on branch {{BRANCH}} for issue {{TASK_ID}}: {{ISSUE_TITLE}}.

# Standards

Follow the coding standards in @.sandcastle/CODING_STANDARDS.md

# Review checklist

1. **Correctness** — Edge cases handled? Unsafe casts? SQL injection? XSS?
2. **Types** — No `any` types. Proper narrowing and discriminated unions.
3. **Domain language** — Terms match `CONTEXT.md` glossary. No banned aliases.
4. **Tests** — Run `pnpm test`: a failing suite is an automatic FAIL. Then judge coverage:
   adequate? Tests actually assert meaningful behavior? Scan the test
   diff first: any deleted test, `.skip`/`.only`, or assertion rewritten to match new behavior
   must be justified by the issue spec — never used to make a failing test pass. Treat an
   unexplained test removal or weakened assertion as a FAIL.
5. **Style** — Follows project conventions in `CLAUDE.md`?

# Fixing

Fix anything you can bring to standard safely, and commit each fix with a conventional message that
references the issue — no tool-name prefix, no AI attribution:
```
fix(scope): correct off-by-one in album upsert

Refs #{{TASK_ID}}
```

# Verdict — the gate

This verdict decides whether the branch is allowed to merge. Be strict; when in doubt, FAIL.

- `PASS` — the branch meets the checklist (after any fixes you committed) and is safe to merge.
- `FAIL` — a real defect remains that you could not safely fix. The branch will be held back.

End your output with exactly one verdict tag:

<verdict>PASS</verdict>

or

<verdict>FAIL</verdict>
