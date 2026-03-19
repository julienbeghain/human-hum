# Deep Module Principles

Guiding architectural principles for Human Hum, adapted from John Ousterhout's "A Philosophy of Software Design." Every new module should be designed deep from the start.

## Core Principle: Deep Over Shallow

A **deep module** has a small interface hiding a large implementation. A **shallow module** has an interface nearly as complex as what it implements.

- Prefer fewer entry points that do more over many thin wrappers
- Push complexity down into the module, not out to callers
- If a consumer needs to understand your internals to use you correctly, your interface is too shallow

## Dependency Categories

When building a new module, classify its dependencies to determine the testing strategy:

| Category | Description | Test Strategy |
|----------|-------------|---------------|
| **In-process** | Pure computation, in-memory state, no I/O | Test directly — merge modules and test at the boundary |
| **Local-substitutable** | Has a local test stand-in (e.g., PGLite for Postgres) | Test with the local stand-in running in the test suite |
| **Ports & adapters** | Own services across a network boundary | Define a port (interface), inject transport. Test with in-memory adapter |
| **True external** | Third-party services you don't control (LastFM, Spotify APIs) | Mock at the boundary. Inject the external dep as a port |

## Testing Strategy: Replace, Don't Layer

- Write tests at the module's **interface boundary**, not on internal functions
- Tests assert on **observable outcomes** through the public interface, not internal state
- Tests should **survive internal refactors** — they describe behavior, not implementation
- When a deep module replaces shallow ones, delete the old shallow tests — they're waste

## Checklist for New Modules

Before shipping a new module, verify:

- [ ] The public interface is smaller than the implementation it hides
- [ ] Callers don't need to understand internals to use it correctly
- [ ] Dependencies are classified and the test strategy matches the category
- [ ] Tests are written at the boundary, not on internal helpers
- [ ] No shallow wrapper exists solely for "testability" — test the real thing
