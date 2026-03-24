# Planning Guide

This file is included from CLAUDE.md and covers planning workflow, documentation conventions, and custom slash commands. Keep this focused on planning sessions — coding-session essentials live in CLAUDE.md.

## Workflow Commands

Custom slash commands in `.claude/commands/`:
- `/rectify` — Scan for inconsistencies between the documentation and the actual codebase, then print a summary report
- `/summarize` — Produce a development summary covering the current state of the repository (recent PRs, open issues, build status, etc.)
- `/state-of-system` — Inspect the actual codebase and print a State of System report to the conversation
- `/load-context` — Re-read `~/.writ/planning/issues.json` and `board.json` (fetched at session start) and summarize open issues and board state
- `/generate-tasks #N` — Break issue #N into concrete GitHub sub-issues in dependency order (Research → Types → Core → Unit tests → Integration test → Docs); creates sub-issues via the GitHub MCP

**Session start**: At the start of each planning session, automatically run `/summarize` then `/state-of-system` before responding to the user, to initialize full planning context.

## Issue Body Convention

When writing or refining a GitHub issue body, use this structure so `/generate-tasks` has enough context to decompose it:

```
## What
[One paragraph: what changes and what the system does differently after.]

## Why
[Motivation: what problem this solves or what capability it enables.]

## Scope
**In:** [Bullet list of what's included]
**Out:** [Bullet list of explicit exclusions]

## Key files
[Bullet list of src/ files most likely to change]

## Acceptance criteria
- [ ] [Verifiable condition]
- [ ] Integration test passes (`npm run test:integration`)
- [ ] CLAUDE.md updated if new source files or wiring changed

## Open questions
[Any unresolved design decisions; leave blank if none]
```

## Documentation Conventions

Four places hold different kinds of truth about this project — don't mix them:

- **`docs/architecture/`** — describes *target systems*. These files document the intended design, even if the component isn't built yet. Update architecture docs when the design changes.
- **`docs/planning/backlog/`** — captures *future possibilities*. Features that are potentially valuable but not yet committed to active development. Each item has its own file; `backlog.md` is the index. When creating, renaming, promoting, or removing a backlog item, update `backlog.md` to match.
- **`CLAUDE.md`** (this file) — the *honest developer guide*. Describes the current state of the code: how to build/run/test, what's actually wired vs. not, key source files. Keep it accurate to reality, not aspirational.

When adding new information: architecture design → `docs/architecture/`; speculative/future features → `docs/planning/backlog/`; how to work with the code → `CLAUDE.md`.

**CLAUDE.md accuracy**: When a feature is completed, update CLAUDE.md to reflect the new current state — key source files, current wiring diagram, provider notes, etc. CLAUDE.md should always describe the actual running code, not an aspirational state. Before committing a completed parent task, verify that CLAUDE.md still accurately reflects the current code.

### Terminology Conventions

Terms with project-specific definitions are italicized: *Agent*, *Script*, *Skill*, etc. First use in each file links to `docs/dictionary.md`. Subsequent uses are bare italics. Only apply when using the project-defined meaning — generic English stays plain. See `docs/dictionary.md` for the full list of defined terms.

## Specs & Planning

Architecture specs live in `docs/architecture/`. Start with `docs/architecture/Overview.md` for the big picture.
