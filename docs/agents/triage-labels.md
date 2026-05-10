# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## AFK vs HITL Decision Guide

Apply `ready-for-agent` when **all** conditions are met:

- Acceptance criteria are concrete and testable (checkboxes, not prose)
- No external account setup, secrets, or OAuth flows required
- No UX judgment calls — the what-to-build is fully specified
- No dependency on unmerged work (blockers are resolved)
- Touches code areas with existing patterns to follow (not greenfield architecture)

Apply `ready-for-human` (HITL) when **any** condition is true:

- Needs design decisions (layout, UX flow, visual direction)
- Requires external service setup (OAuth apps, API keys, third-party accounts)
- Involves security-sensitive code (auth, tokens, permissions)
- Acceptance criteria are ambiguous or need conversation
- First-of-its-kind pattern with no existing code to reference
- Issue is an epic or PRD (parent issues that spawn sub-issues)
