# Claude Code Setup Template

_Derived from the `writ` project. Use this as a checklist when bootstrapping Claude Code
for a new project in this development style._

---

## 1. Permissions — `.claude/settings.json`

Allow `Read` and `Edit` without per-call permission prompts so Claude can navigate and
edit code fluently in a trusted local environment:

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Edit"
    ]
  }
}
```

Add any other tools you want pre-approved (e.g. `Bash`, `Write`, `Glob`, `Grep`).

---

## 2. SessionStart Hook

Register a hook in `.claude/settings.json` that runs automatically on every session
start or resume:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh"
          }
        ]
      }
    ]
  }
}
```

**What the hook does** (in `.claude/hooks/session-start.sh`):

1. `git fetch origin main` — keeps the local main ref current as a rebase reference.
2. Prints branch name + latest main commit SHA to stderr → appears in the
   `<user-prompt-submit-hook>` context block, giving Claude instant orientation.
3. **Planning env only** (`CLAUDE_DEV_ENV_ID=planning`):
   - Fetches open GitHub issues and project board via the GitHub API (requires `GH_TOKEN`).
   - Trims issue JSON to relevant fields and writes to `~/.writ/planning/issues.json`
     and `~/.writ/planning/board.json` (outside the working tree — no git noise).
   - Pushes a snapshot commit to a special `origin/planning` cache branch (git plumbing,
     no checkout) so planning data persists across sessions even when `GH_TOKEN` is unset.
   - Falls back to reading that cache if `GH_TOKEN` is unavailable.
   - Runs the `summarize.sh` script to print a dev summary automatically.
   - Prints "Run /load-context …" reminder.

**Key design decisions:**
- Planning data lives at `~/.writ/planning/` (outside the working tree) to avoid polluting
  `git status`.
- The `planning` branch is a dead-drop cache written with `git mktree` + `git commit-tree`
  — the working tree is never checked out to it.
- The hook short-circuits early (exits 0) for non-planning environments so it stays fast.

---

## 3. Custom Slash Commands — `.claude/commands/`

Each `.md` file in `.claude/commands/` becomes a `/command-name` slash command.
The file body is expanded as a prompt when the command is invoked.

### `/load-context`
Reads `~/.writ/planning/issues.json` and `board.json` and prints a structured summary:
issue counts by label, on-deck list, needs-refinement list, blocked issues, branch status,
and a "ready" section with next actions.

### `/summarize`
Runs `.claude/scripts/summarize.sh` and presents the output. Optionally appends test
results. (The script covers: merged PRs, open branches, issues by label, diff from main,
recent commits, TODOs/FIXMEs in source.)

### `/state-of-system`
Deep on-demand architecture review: reads `src/` directly to report what's built and
tested, what's stubbed, the actual call graph, active adapters, test coverage, and known
gaps. Derives everything from source — never copies from docs.

### `/rectify`
Doc-vs-code consistency scan across 6 checks: docs describing nonexistent code, code
without documentation, stale/broken internal links, resolved open questions, TODO
placeholders in spec docs, and `CLAUDE.md` accuracy vs. actual source files.

### `/generate-tasks #N`
Breaks a GitHub issue into ordered sub-issues (Research → Types → Core → Unit tests →
Integration test → Docs) and creates them via the GitHub MCP. Requires a well-formed
issue body (What / Why / Scope / Acceptance criteria). The integration test sub-issue
is always required — never skipped.

---

## 4. Summarize Script — `.claude/scripts/summarize.sh`

A standalone bash script (safe to run anytime) that prints a markdown dev summary:

- Merged PRs to `origin/main` in the last 30 days (from `git log`)
- Open remote branches (excluding `main` and `planning`)
- Issues by label (`on-deck`, `needs-refinement`) — reads from `~/.writ/planning/issues.json`
  cache first; falls back to live GitHub API if `GH_TOKEN` is set
- Files changed from `origin/main`
- Last 10 commits
- TODOs / FIXMEs / HACKs / XXXs in `src/` TypeScript files

Called automatically by the session-start hook in the planning environment.

---

## 5. CLAUDE.md Structure

`CLAUDE.md` is the honest developer guide — it describes the **current state of the code**,
not aspirational design. Key sections:

| Section | Purpose |
|---|---|
| `@ignore <dir>` | Tell Claude to ignore a directory (e.g. `export/`) |
| `@<path>` include | Pull in another file (e.g. `@.claude/planning-guide.md`) |
| Build & Run | All `npm run` commands with one-line descriptions |
| GitHub API Access | Environment-specific quirks (e.g. `gh` CLI not available; use `curl` with `GH_TOKEN`) |
| Architecture | Current wiring diagram + key source files with one-line descriptions |
| Destructive Action Safeguards | Project-specific rules requiring confirmation before destructive ops |
| Code Patterns | Functional style, Zod validation, test colocation, script frontmatter conventions |
| Integration Test Requirements | Required for every pipeline-touching feature; describes what "done" looks like |

**Accuracy rule**: CLAUDE.md must reflect reality. Update it when a feature ships.

---

## 6. Planning Guide — `.claude/planning-guide.md`

Included from CLAUDE.md via `@.claude/planning-guide.md`. Covers:

- Workflow commands (slash command descriptions)
- Issue body convention (What / Why / Scope / Key files / Acceptance criteria / Open questions)
- Documentation conventions — four places, each with a distinct role:
  - `docs/architecture/` — target system design (can be aspirational)
  - `docs/planning/backlog/` — future possibilities not yet committed
  - `CLAUDE.md` — honest current state
  - GitHub issues — active tracked work
- Terminology conventions: project-specific terms italicized, first use links to `docs/dictionary.md`
- Claude Code planning environment setup (layout, external planning files, session-start hook docs, env vars)

---

## 7. Planning Branch — `origin/planning`

A special git branch used as a dead-drop cache for planning data between sessions.

- Contains only `issues.json` and `board.json`
- Written by the session-start hook using git plumbing (`git mktree`, `git commit-tree`,
  `git push <sha>:refs/heads/planning`)
- The working tree is **never** checked out to this branch
- Allows planning data to persist across sessions even without `GH_TOKEN`

To create the branch from scratch:
```bash
echo '{}' > /tmp/empty.json
BLOB=$(git hash-object -w /tmp/empty.json)
TREE=$(printf "100644 blob %s\tissues.json\n100644 blob %s\tboard.json\n" "$BLOB" "$BLOB" | git mktree)
COMMIT=$(git commit-tree "$TREE" -m "planning: init")
git push origin "$COMMIT:refs/heads/planning"
```

---

## 8. Required Environment Variables

| Variable | Where set | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `.env` | LLM calls (required unless `LLM_PROVIDER=ollama`) |
| `GH_TOKEN` | Cloud env settings | GitHub API access: fetch issues, push planning branch |
| `LLM_PROVIDER` | `.env` | Set to `ollama` to use a local model instead of Anthropic |
| `OLLAMA_BASE_URL` | `.env` | Ollama endpoint (default: `http://localhost:11434`) |
| `OLLAMA_MODEL` | `.env` | Ollama model name |
| `CLAUDE_DEV_ENV_ID` | Cloud env settings | Set to `planning` to activate planning-specific hook behavior |

`GH_TOKEN` minimum scopes: `repo` (read issues, push planning branch).

---

## 9. Multi-Environment Pattern

The session-start hook checks `CLAUDE_DEV_ENV_ID` to distinguish environments:

- **Default / implementation env**: fetches main, prints branch context, exits early.
  Fast and non-intrusive for coding sessions.
- **`planning` env**: additionally fetches GitHub data, maintains the cache branch, runs
  the summarize script, and prints planning directives.

This lets you run multiple Claude Code environments (e.g. one for coding, one for planning)
from the same repository without cross-contamination.

---

## 10. File Layout Summary

```
.claude/
  settings.json               # Permissions + hook registration
  hooks/
    session-start.sh           # SessionStart hook (git fetch, issue load, summarize)
  scripts/
    summarize.sh               # Dev summary script (called by hook; safe standalone)
  commands/
    load-context.md            # /load-context
    summarize.md               # /summarize
    state-of-system.md         # /state-of-system
    rectify.md                 # /rectify
    generate-tasks.md          # /generate-tasks #N
  planning-guide.md            # Included from CLAUDE.md; workflow + doc conventions

CLAUDE.md                      # Honest developer guide (current state, not aspirational)
docs/
  architecture/                # Target system design
  planning/
    backlog/                   # Speculative future features
    backlog.md                 # Index of backlog items
    OpenQuestions.md           # Tracked open design questions
  dictionary.md                # Project-specific term definitions
```

External (outside working tree):
```
~/.{project}/planning/
  issues.json                  # Trimmed GitHub issues snapshot
  board.json                   # Project board snapshot
```

---

## 11. Checklist for a New Project

- [ ] Create `.claude/settings.json` with `permissions.allow` for Read + Edit (add more as needed)
- [ ] Write `.claude/hooks/session-start.sh` — at minimum: `git fetch origin main`, print branch + latest main SHA
- [ ] Register the hook under `SessionStart` in `settings.json`
- [ ] Create `.claude/scripts/summarize.sh` with: merged PRs, open branches, issues, diff from main, recent commits, TODOs
- [ ] Add slash commands in `.claude/commands/` for your workflow (load-context, summarize, state-of-system, rectify, generate-tasks)
- [ ] Write `CLAUDE.md`: build/run commands, architecture overview, key source files, code patterns, destructive action safeguards
- [ ] Add `@.claude/planning-guide.md` include in `CLAUDE.md` and write the planning guide
- [ ] Create a `docs/dictionary.md` for project-specific terminology
- [ ] Set up the `planning` git branch as a dead-drop cache (if using multi-session planning)
- [ ] Configure `GH_TOKEN` and `CLAUDE_DEV_ENV_ID=planning` in the cloud environment settings (for the planning env)
- [ ] Copy `.env.example` → `.env` and fill in `ANTHROPIC_API_KEY`
