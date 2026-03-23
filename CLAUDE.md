# CLAUDE.md

<!-- Ignore exported/archived files — not part of the working codebase -->
@ignore export/

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Writ is a self-improving, locally-deployed multi-agent system inspired by OpenClaw with a security-first redesign. The core analogy is "agent as a self-expanding OS." The system routes user requests through an Orchestrator → [*Planner*](docs/dictionary.md) → Executor → shell script pipeline, with each agent's output reviewed before proceeding.

## Build & Run

```bash
npm run build        # Compile TypeScript (tsc)
npm run dev          # Run via tsx (development)
npm run dev -- --no-review  # Skip reviewer checks
npm start            # Run compiled JS (production)
npm test             # Run unit tests only (vitest)
npm run test:watch   # Watch mode (unit tests)
npm run test:integration  # Run integration tests only (mocked LLM by default)
npm run test:all     # Run unit + integration tests
npm run logs         # Print log summary to terminal + write agent-log.json (pretty JSON for VSCode)
```

Integration tests use mocked LLM by default. To run with real API calls (tests 1–3 only; 4–5 skip):
```bash
USE_REAL_LLM=1 npm run test:integration
```

Requires `ANTHROPIC_API_KEY` in `.env` (copy `.env.example`).

**Provider switching**: Set `LLM_PROVIDER=ollama` in `.env` to use a locally-hosted model instead of the Anthropic API. Useful for dev/smoke testing to reduce API costs. Set `OLLAMA_BASE_URL` and `OLLAMA_MODEL` as needed (defaults: `http://localhost:11434` and configurable model).

## GitHub API Access

The `gh` CLI does not work in this environment — the git remote points to a local proxy that `gh` does not recognize as a GitHub host. Use the GitHub API directly with `GH_TOKEN`:

```bash
# List issues by label
curl -s -H "Authorization: token $GH_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/hikusukih/writ/issues?state=open&labels=on-deck&per_page=50"

# Create an issue
curl -s -X POST -H "Authorization: token $GH_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/hikusukih/writ/issues" \
  -d '{"title":"...","body":"...","labels":["..."]}'
```

If `GH_TOKEN` is unset, GitHub operations are unavailable — note it and skip rather than failing.

## Architecture

### Current Wiring
```
User input → Orchestrator (interprets intent, creates job DAG)
           → Scheduler (dependency resolution, concurrent execution)
           → DefaultJobExecutor (routes by job type to GP/LP/DW/Executor/Compiler)
               → General Planner (produces StrategicPlan with WorkAssignments)
               → Lieutenant Planner (per assignment: detailed Plan with script-level steps)
                 → Developer/Writer (if LP detects missing scripts: generate → review → promote)
               → Executor (maps plan to instruction JSON)
               → Compiler (validates + composes + runs scripts)
           → Results collected across all jobs
           → Orchestrator (LLM call: interprets results → natural-language response)
           → Response with provenance chain
```
The Scheduler is the execution backbone. The Orchestrator calls the General Planner to partition work into WorkAssignments, then creates a job DAG from those assignments and hands it to the Scheduler, which resolves dependencies and runs jobs concurrently (default limit 3). `DefaultJobExecutor` dispatches each job type to the appropriate pipeline agent. Fast jobs respond synchronously; slow jobs send an acknowledgement and deliver results async (throbber pattern). Channel routing uses `getChannel()` on `IOAdapter`. Multi-assignment plans collect results from all LP → Executor chains.

**Review chain**: `handleRequest()` reviews the orchestrator's task description and final response using LLM-backed `applyReview()`. `applyReview(content, identity, options?)` uses a `ReviewOptions` object: `{ client?, skipReview?, adapter?, subjectAgentId?, logsDir?, sampling? }`. Calls `reviewWithLLM()` (which passes SOUL.md + CONSTITUTION.md + per-agent anti-patterns to Claude) when an LLMClient is provided; falls back to rule-based `reviewOutput()` on failure. FAFC decisions route through the Human-Judgment Agent (`handleFAFC()`) when an IOAdapter is available; without an adapter, FAFC falls back to halt. The `--no-review` flag bypasses all review. Review decisions are logged to `runtime/logs/review-decisions.jsonl` for RR auditing.

**Self-improvement chain**: After each `handleRequest()`, a fire-and-forget Reviewer-Reviewer (RR) samples a recent review decision and audits it for constitutional consistency. If RR flags an inconsistency, BIG_BROTHER proposes config updates to the affected agent/reviewer. BB's proposals go through review (with a 3-round self-modification cap). Config writes use atomic `.pending` → rename with backups to `runtime/config-backups/`. Sampling rates decay with clean reviews and reset on flags or config changes.

**Conversation history**: Each turn appends user input + orchestrator response + a side-effect summary (scripts run, params, exit status) to in-memory history, persisted to `runtime/sessions/current.json` after each turn. On startup, if a session file exists, the user is prompted to restore it.

### Key Source Files
- `src/index.ts` — CLI REPL entry point
- `src/types.ts` — All shared types; `src/schemas.ts` — Zod runtime validation
- `src/agents/orchestrator.ts` — `handleRequest()` top-level delegation
- `src/agents/planner.ts` — `createStrategicPlan()` (GP) partitions tasks into WorkAssignments; legacy `createPlan()` still present
- `src/agents/lieutenant-planner.ts` — `createDetailedPlan()` (LP) produces script-level plans from assignments; `createDetailedPlanWithDW()` orchestrates DW integration + review
- `src/agents/developer-writer.ts` — `generateScript()`, `stageScript()`, `promoteScript()`, `generateAndPromote()` — script authoring pipeline
- `src/agents/executor.ts` — `executeFromPlan()` maps plans to script instructions
- `src/agents/base.ts` — `invokeAgent()` core agent invocation
- `src/agents/claude-client.ts` — `LLMClient` interface, `createClaudeClient()`, `createLLMClient()` (mockable)
- `src/agents/ollama-client.ts` — `createOllamaClient()` for local model provider
- `src/agents/prompt-builder.ts` — `buildSystemPrompt()` assembles LLM prompts from identity + context
- `src/agents/reviewer.ts` — Rule-based security checks (fast pre-filter / fallback)
- `src/agents/llm-reviewer.ts` — `reviewWithLLM()` LLM-based reviewer with SOUL/CONSTITUTION context
- `src/agents/reviewed.ts` — `withReview()` HOF and `applyReview(content, identity, options?)` helper; `ReviewOptions` object pattern
- `src/agents/human-judgment-agent.ts` — `handleFAFC()` infrastructure for FAFC review decisions
- `src/agents/review-log.ts` — Review decision logging (append-only JSONL, SHA-256 content hashes)
- `src/agents/reviewer-reviewer.ts` — `auditReviewDecision()`, `sampleAndAudit()` — OS-class RR auditor
- `src/agents/big-brother.ts` — `proposeConfigUpdate()`, `applyConfigUpdate()`, `triggerBigBrother()` — self-improvement agent
- `src/agents/sampling-rate.ts` — Review sampling rate: `getRate()`, `recordClean()`, `recordFlag()`, `resetOnContextChange()`
- `src/agents/semantic-review.ts` — Pre-execution semantic review gate (stubbed, off by default)
- `src/agents/llm-utils.ts` — `extractJson()` and `callWithValidation()` shared LLM utilities
- `src/identity/loader.ts` — Loads SOUL.md, CONSTITUTION.md, registry, anti-patterns
- `src/identity/anti-patterns.ts` — `appendAntiPattern()` for BIG_BROTHER use
- `src/identity/writer.ts` — `writeAgentConfig()`, `writeReviewerConfig()`, `backupConfig()` — atomic config writes
- `src/compiler/compiler.ts` — [*Compiler*](docs/dictionary.md): validates instruction JSON, optional semantic review gate, runs scripts
- `src/scripts/runner.ts` — Shell script execution with timeout (internal to *Compiler*)
- `src/scripts/index.ts` — [*Script*](docs/dictionary.md) discovery via `@name`/`@description`/`@param` frontmatter
- `src/io/IOAdapter.ts` — `IOAdapter` interface for messaging abstraction; `getChannel()` returns the active channel for job routing
- `src/io/CLIAdapter.ts` — `createCLIAdapter()` CLI implementation of IOAdapter
- `src/io/TestAdapter.ts` — `TestAdapter` IOAdapter for tests: collects all output into inspectable arrays, configurable `requestConfirmation()`
- `src/test-utils/MockLLMClient.ts` — `MockLLMClient` pattern-matched mock LLM client for integration tests; configurable per-agent responses
- `src/integration/pipeline.integration.test.ts` — 5 smoke tests exercising the full Orch → GP → LP → Executor → Compiler pipeline
- `src/jobs/types.ts` — `Job`, `JobType`, `JobStatus`, `Callback`, `StatementRef` types
- `src/jobs/store.ts` — `createJobStore()` persistent job store in `runtime/jobs/`
- `src/jobs/scheduler.ts` — `createScheduler()` DAG scheduler with dependency resolution, concurrent execution (default limit 3), callbacks
- `src/jobs/defaultExecutor.ts` — `createDefaultJobExecutor()`, routes job types to pipeline agents (GP, LP, DW, Executor, Compiler)
- `src/logger.ts` — `setVerbose()`, `isVerbose()`, `verbose()` logging utilities
- `src/sessions.ts` — `loadSession()`/`saveSession()` for persisting conversation history to `runtime/sessions/`

### Instance Assets (`src/instance/`)
- `src/instance/identity/` — Identity files the system reads about itself
  - `SOUL.md` — System personality (user-editable via mediation)
  - `CONSTITUTION.md` — Core values: honesty, loyalty, helpfulness, secret-guarding, pro-social
  - `registry.json` — [*Agent*](docs/dictionary.md) registry with roles, classes, permissions
  - `agents/*.md` — Per-agent config (XYZ-AGENT.md pattern from spec); `{id}-reviewer-agent.md` files carry role-specific reviewer guidance loaded by `loader.ts` into `IdentityContext.reviewerConfigs`
  - `anti-patterns/anti-patterns-{agentId}.md` — Per-agent append-only anti-pattern lists, loaded into `IdentityContext.antiPatterns`, included in LLM reviewer prompt
- `src/instance/scripts/` — Shell scripts the system can discover and execute (scoped to project root)

### Runtime Directories
- `runtime/` — All runtime-generated files (gitignored)
  - `runtime/plans/` — PLANXYZ.md files and instruction JSON
  - `runtime/logs/` — Append-only `agent.jsonl` audit trail + `review-decisions.jsonl` for RR auditing; run `npm run logs` to snapshot as pretty `agent-log.json` for browsing in VSCode
  - `runtime/sessions/` — Persisted conversation history; `current.json` is loaded at startup with a resume prompt
  - `runtime/jobs/` — Persistent job store for the scheduler
  - `runtime/config-backups/` — Atomic config write backups from identity writer
  - `runtime/staging/scripts/` — Developer/Writer script staging area before promotion

### Project Tooling
- `scripts/` — Dev/CI scripts (export-for-claude.sh). Not used by the running instance.

## Destructive Action Safeguards

Before any command that deletes, overwrites, or bulk-replaces files outside `runtime/`, confirm the target list and get explicit user approval. This includes but is not limited to: `rm -rf`, `git push --force`, bulk file moves/renames, and any operation that would overwrite source files or identity files.

When a task involves removing or replacing existing content, list what will be affected before acting. Err on the side of asking.

Never delete or overwrite files under `src/instance/identity/` without FAFC-style confirmation — these are the system's core identity and values.

## Code Patterns

- **Functional style**: Export functions, not classes. `LLMClient` is an interface for mockability.
- **Zod validation**: All JSON read from disk or parsed from Claude responses validated with Zod schemas.
- **Tests alongside source**: `foo.ts` → `foo.test.ts` in same directory. Vitest with mocked Claude client.
- **Integration tests**: `src/integration/*.integration.test.ts` — run via `npm run test:integration`. Use `TestAdapter` (`src/io/TestAdapter.ts`) + `MockLLMClient` (`src/test-utils/MockLLMClient.ts`) for full pipeline coverage. Tests import functions directly — no process spawning, no readline, no `CLIAdapter`. `npm test` excludes these; `npm run test:all` includes both. **When implementing a new feature, add or extend an integration test in `src/integration/pipeline.integration.test.ts` to cover the happy path through the full pipeline.**
- **Script frontmatter**: Shell scripts use `# @name`, `# @description`, `# @param` comment headers for discovery.

## Integration Test Requirements

Every new feature that touches the pipeline requires an integration test in `src/integration/`:

- Validate behavior end-to-end via `handleRequest()` → inspect `TestAdapter` output arrays
- Use `MockLLMClient` for deterministic responses; if the feature needs new response shapes, add them to `MockLLMClient`
- Features that add new agent roles or review paths must include both an "allow" (happy path) and a "deny/halt" test case
- `/generate-tasks` and `/process-task-list` treat a missing integration test as incomplete work — the parent task is not done until the integration test passes

## Workflow Commands

Custom slash commands in `.claude/commands/`:
- `/rectify` — Scan for inconsistencies between the documentation and the actual codebase, then print a summary report
- `/summarize` — Produce a development summary covering the current state of the repository (recent PRs, open issues, build status, etc.)
- `/state-of-system` — Inspect the actual codebase and print a State of System report to the conversation

## Documentation Conventions

Four places hold different kinds of truth about this project — don't mix them:

- **`docs/architecture/`** — describes *target systems*. These files document the intended design, even if the component isn't built yet. No implementation-status hedges here; Roadmap.md owns that. Update architecture docs when the design changes.
- **`docs/planning/Roadmap.md`** — tracks *implementation status*. What's built, what's next, phase markers, known issues. Update it as components are completed or phases change.
- **`docs/planning/backlog/`** — captures *future possibilities*. Features that are potentially valuable but not yet committed to the Roadmap. Each item has its own file; `backlog.md` is the index. When creating, renaming, promoting, or removing a backlog item, update `backlog.md` to match.
- **`CLAUDE.md`** (this file) — the *honest developer guide*. Describes the current state of the code: how to build/run/test, what's actually wired vs. not, key source files. Keep it accurate to reality, not aspirational.

When adding new information: architecture design → `docs/architecture/`; build status → `Roadmap.md`; speculative/future features → `docs/planning/backlog/`; how to work with the code → `CLAUDE.md`.

**CLAUDE.md accuracy**: When a Roadmap item moves to `[x]`, update CLAUDE.md to reflect the new current state — key source files, current wiring diagram, provider notes, etc. CLAUDE.md should always describe the actual running code, not an aspirational state. This applies in particular when using `/process-task-list`: before committing a completed parent task, verify that CLAUDE.md still accurately reflects the current code.

**Roadmap completion dates**: When marking a roadmap task `[x]`, append the completion date in parentheses: `[x] (completed YYYY-MM-DD)`. Use the date the task was verified working, not the date work started. If the date can be inferred from git history, use that; otherwise use today's date.

### Terminology Conventions

Terms with project-specific definitions are italicized: *Agent*, *Script*, *Skill*, etc. First use in each file links to `docs/dictionary.md`. Subsequent uses are bare italics. Only apply when using the project-defined meaning — generic English stays plain. See `docs/dictionary.md` for the full list of defined terms.

## Specs & Planning

Architecture specs live in `docs/architecture/`. Start with `docs/architecture/Overview.md` for the big picture. See `docs/planning/Roadmap.md` for implementation status.
