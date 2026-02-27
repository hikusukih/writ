# Scenario CI via Claude Code Web

## Summary
Use Claude Code web sessions as an automated integration testing environment. Each session boots a clean DomestiClaw instance, feeds it behavioral scenarios, observes results, and validates that the system performs as expected — including script authoring, review, and execution. Doubles as a self-improvement smoke test: can the system write useful scripts and make progress on real tasks without human intervention?

## Motivation
Unit tests verify individual components. Scenario CI verifies the *system* — the full agent chain operating on real LLM calls against real tasks. The ephemeral nature of Claude Code web sessions is an asset: every run starts from a clean repo clone (the "base shipped instance"), so tests are reproducible and state pollution is impossible.

This also provides the first external validation surface for self-improvement: does a cold-start instance, given a task, successfully author scripts, pass its own review chain, and produce correct output? If yes, the system has genuine autonomous capability. If not, the failure modes are visible and debuggable.

## How It Works

1. Claude Code web session starts, clones the repo.
2. `.env` is configured with an API key (set via Claude Code environment config or secrets).
3. `npm run build` → `npm run dev` starts the instance.
4. Claude Code (acting as the external test harness) feeds the instance a predefined scenario via the CLI adapter — e.g., "combine all markdown files in docs/architecture/ into one file."
5. The instance runs its full pipeline: Orch → GP → LP → DW (if needed) → Executor → Compiler.
6. Claude Code observes the output: did the right scripts run? Did the output file appear with correct content? Did review pass without flags?
7. Results are logged. If the instance authored new scripts during the scenario, Claude Code inspects them for correctness.
8. Passing scenarios: Claude Code commits any instance-generated artifacts (new scripts, updated configs) to a branch for human review.
9. Failing scenarios: Claude Code captures the failure mode (logs, plan files, review decisions) and includes them in the PR or test report.

## Scenario Categories

- **Capability scenarios**: Can the instance accomplish a concrete task end-to-end? (File operations, content generation, multi-step workflows)
- **Self-authoring scenarios**: Given a task requiring a script that doesn't exist, does DW produce a working script that passes review?
- **Review chain scenarios**: Does the review chain catch intentionally problematic plans or scripts? (Negative tests)
- **Recovery scenarios**: Given a task that fails partway through, does the system surface the failure cleanly? (Once Job Graph is built: does `needs_replan` trigger correctly?)

## Design Notes

- **Not a replacement for unit tests.** Vitest covers component correctness. Scenario CI covers system behavior. Both are needed.
- **LLM costs are real.** Each scenario run makes multiple API calls (planning, review, execution, response synthesis). Scenarios should be curated and finite, not exploratory fuzzing. Start with 3–5 canonical scenarios.
- **Session duration matters.** Claude Code web sessions share rate limits with all Claude usage. Keep scenarios focused — one scenario per session if needed, parallelized across sessions.
- **Determinism is not the goal.** LLM outputs vary. Scenario validation should check *outcomes* (did the file appear? does the script run?) not exact outputs. This is behavioral testing, not regression testing.
- **The commit-back loop.** Instance-generated scripts that pass scenario validation get committed to a branch. A human reviews the PR. This is the same Developer/Writer → review → promote flow, but with CI as the trigger instead of a user request. The branch workflow backlog item (backlog-branch-workflow.md) is a natural companion.

## Implementation Surface

- A `/scenario-test` Claude Code slash command or a GitHub Action workflow that triggers a web session.
- A `scenarios/` directory in the repo with scenario definitions (task description, expected outcomes, validation criteria).
- Scenario definitions should be declarative enough that Claude Code can execute them without custom test harness code — the instance's own CLI is the interface.

## Constraints

- Requires a working end-to-end pipeline (Orch → GP → LP → Executor → Compiler). Not useful until the core loop is solid.
- Requires Claude Code web access (Pro/Max/Team/Enterprise with premium seats).
- API key management: the instance's `.env` needs a valid key. Claude Code web supports secrets/env config for this.
- Network: Anthropic API calls go through the session proxy. Ollama (local model) won't be available in the cloud session — scenarios must use the Anthropic provider.

## Dependencies
Core pipeline stability (Phase 3 complete). Job Graph & Scheduler (for recovery/replan scenarios). Developer/Writer (for self-authoring scenarios).

## Unlocks
Automated behavioral validation of the full system. Evidence-based confidence in self-improvement capability. A path toward continuous integration for an agentic system.
