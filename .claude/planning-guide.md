# Planning Guide

This file is included from CLAUDE.md and covers planning workflow, documentation conventions, and custom slash commands. Keep this focused on planning sessions — coding-session essentials live in CLAUDE.md.

## Workflow Commands

Custom slash commands in `.claude/commands/`:
- `/rectify` — Scan for inconsistencies between the documentation and the actual codebase, then print a summary report
- `/summarize` — Produce a development summary (recent PRs, open issues, TODOs, etc.). Runs `.claude/scripts/summarize.sh`; the session-start hook already runs this automatically in the planning env, so use the command only when you want a fresh mid-session refresh.
- `/state-of-system` — Inspect the actual codebase and print a State of System report to the conversation. On-demand only.
- `/load-context` — Re-read `~/.writ/planning/issues.json` and `board.json` (fetched at session start) and summarize open issues and board state
- `/generate-tasks #N` — Break issue #N into concrete GitHub sub-issues in dependency order (Research → Types → Core → Unit tests → Integration test → Docs); creates sub-issues via the GitHub MCP

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

---

## Claude Code Planning Environment

This section documents the setup for Claude Code on the web, where the file tree is not visible
and the environment must be reconstructed from documentation alone.

### Repository layout (planning-relevant files)

```
.claude/
  settings.json               # Registers the SessionStart hook
  hooks/
    session-start.sh           # Runs on every session start/resume (see below)
  commands/
    load-context.md            # /load-context  — summarizes ~/.writ/planning/ files
    summarize.md               # /summarize     — dev summary (PRs, branches, tests)
    state-of-system.md         # /state-of-system — live codebase inspection report
    rectify.md                 # /rectify       — doc vs code consistency scan
    generate-tasks.md          # /generate-tasks #N — breaks issue into sub-issues
  planning-guide.md            # This file (included from CLAUDE.md via @)
```

### External planning files (`~/.writ/planning/`)

These files live **outside the working tree** so they don't pollute git status. They are
written by `session-start.sh` and read by `/load-context`.

```
~/.writ/planning/
  issues.json    # Trimmed snapshot of open GitHub issues (number, title, labels,
                 #   assignees, milestone, body_preview, updated_at)
  board.json     # Classic project board snapshot (columns + card content_urls)
```

Both files include a `fetched_at` timestamp. If `GH_TOKEN` was not set when the session
started, they may contain `{"error": "GH_TOKEN not set, no cache available", ...}`.

### Session-start hook (`session-start.sh`)

Registered in `settings.json` as a `SessionStart` hook — Claude Code runs it automatically
on every session start or resume. It does **not** run during mid-session tool calls.

**What it does (in order):**

1. `git fetch origin main` — keeps the local main ref current for rebase reference
2. `git fetch origin planning` — pulls the planning branch cache (see below)
3. Load planning data:
   - **If `GH_TOKEN` is set**: fetch live from GitHub API → write `issues.json` + `board.json` → push a snapshot commit to `origin/planning` (git plumbing, no checkout — working tree untouched)
   - **If `GH_TOKEN` is unset**: read `issues.json` / `board.json` from `origin/planning` cache as fallback
4. Print a summary to stderr (branch name, latest main commit, issue counts by label) — this is what appears in the `<user-prompt-submit-hook>` context block at session start

### The `planning` branch

A special git branch (`origin/planning`) used as a dead-drop cache for planning data.
It contains only two files: `issues.json` and `board.json`. It is written by the hook
using `git mktree` + `git commit-tree` + `git push` — the working tree is never checked
out to this branch. This lets planning data persist across sessions even when `GH_TOKEN`
is unavailable.

### Required environment variables

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (unless `LLM_PROVIDER=ollama`) | LLM calls |
| `GH_TOKEN` | Strongly recommended | Live issue/board fetch + planning branch push |
| `WRIT_GITHUB_TOKEN` | For Gist integration tests only | Gist-scoped PAT; separate from `GH_TOKEN` |

`GH_TOKEN` must have at minimum: `repo` (read issues, push planning branch).
Without it, planning data falls back to the cached snapshot on `origin/planning`.

### Bootstrapping a new session from scratch

If you are in a fresh Claude Code session with no prior context:

1. Check the `<user-prompt-submit-hook>` block at the top of the conversation — the
   session-start hook prints branch name, latest main, and issue counts there.
2. Run `/load-context` to pull `~/.writ/planning/issues.json` into the conversation.
3. Run `/summarize` + `/state-of-system` for full development context (the planning-guide
   instructs Claude to run these automatically at session start).
4. If issue data shows `"error": "GH_TOKEN not set"`, planning data may be stale —
   set `GH_TOKEN` in the project's environment settings and start a new session.
