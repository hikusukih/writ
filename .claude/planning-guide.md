# Planning Guide

This file is included from CLAUDE.md and covers planning workflow, documentation conventions, and custom slash commands. Keep this focused on planning sessions — coding-session essentials live in CLAUDE.md.

## Workflow Commands

Custom slash commands in `.claude/commands/`:
- `/rectify` — Scan for inconsistencies between the documentation and the actual codebase, then print a summary report
- `/summarize` — Produce a development summary covering the current state of the repository (recent PRs, open issues, build status, etc.)
- `/state-of-system` — Inspect the actual codebase and print a State of System report to the conversation
- `/load-context` — Re-read `runtime/planning/issues.json` and `board.json` (fetched at session start) and summarize open issues and board state
- `/change-directive [#N]` — Draft a structured Change Directive for a given issue or the current context; scaffolds scope, acceptance criteria, and key files
- `/generate-tasks [#N]` — Break a Change Directive or issue into a concrete TodoWrite task list in dependency order, including integration test and docs update steps

## Documentation Conventions

Four places hold different kinds of truth about this project — don't mix them:

- **`docs/architecture/`** — describes *target systems*. These files document the intended design, even if the component isn't built yet. No implementation-status hedges here; Roadmap.md owns that. Update architecture docs when the design changes.
- **`docs/planning/Roadmap.md`** — tracks *implementation status*. What's built, what's next, phase markers, known issues. Update it as components are completed or phases change.
- **`docs/planning/backlog/`** — captures *future possibilities*. Features that are potentially valuable but not yet committed to the Roadmap. Each item has its own file; `backlog.md` is the index. When creating, renaming, promoting, or removing a backlog item, update `backlog.md` to match.
- **`CLAUDE.md`** (this file) — the *honest developer guide*. Describes the current state of the code: how to build/run/test, what's actually wired vs. not, key source files. Keep it accurate to reality, not aspirational.

When adding new information: architecture design → `docs/architecture/`; build status → `Roadmap.md`; speculative/future features → `docs/planning/backlog/`; how to work with the code → `CLAUDE.md`.

**CLAUDE.md accuracy**: When a Roadmap item moves to `[x]`, update CLAUDE.md to reflect the new current state — key source files, current wiring diagram, provider notes, etc. CLAUDE.md should always describe the actual running code, not an aspirational state. Before committing a completed parent task, verify that CLAUDE.md still accurately reflects the current code.

**Roadmap completion dates**: When marking a roadmap task `[x]`, append the completion date in parentheses: `[x] (completed YYYY-MM-DD)`. Use the date the task was verified working, not the date work started. If the date can be inferred from git history, use that; otherwise use today's date.

### Terminology Conventions

Terms with project-specific definitions are italicized: *Agent*, *Script*, *Skill*, etc. First use in each file links to `docs/dictionary.md`. Subsequent uses are bare italics. Only apply when using the project-defined meaning — generic English stays plain. See `docs/dictionary.md` for the full list of defined terms.

## Specs & Planning

Architecture specs live in `docs/architecture/`. Start with `docs/architecture/Overview.md` for the big picture. See `docs/planning/Roadmap.md` for implementation status.
