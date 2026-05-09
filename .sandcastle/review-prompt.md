# Task

Review the code changes on branch {{BRANCH}} for issue {{TASK_ID}}: {{ISSUE_TITLE}}.

# Standards

Follow the coding standards in @.sandcastle/CODING_STANDARDS.md

# Review checklist

1. **Correctness** — Edge cases handled? Unsafe casts? SQL injection? XSS?
2. **Types** — No `any` types. Proper narrowing and discriminated unions.
3. **Domain language** — Terms match `CONTEXT.md` glossary. No banned aliases.
4. **Tests** — Adequate coverage? Tests actually assert meaningful behavior?
5. **Style** — Follows project conventions in `CLAUDE.md`?

# Output

If improvements are needed, make the changes and commit with:
```
SANDCASTLE: review(scope): description of refinement
```

If no changes needed, say so.

Once review is complete, output:

<promise>COMPLETE</promise>
