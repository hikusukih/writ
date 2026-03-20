# State of System

_Generated: 2026-03-20. Reflects actual codebase — not aspirational docs._

---

## Built and Working

All items below have test files and pass `npm test` (27 test files, 232 tests, 0 failures) and `npm run test:integration` (1 test file, 15 tests, 0 failures).

### Agents (`src/agents/`)

| Agent / Module | File | Test File | Status |
|---|---|---|---|
| Orchestrator (`handleRequest`) | `orchestrator.ts` | `orchestrator.test.ts` | Built + tested |
| General Planner (`createStrategicPlan`) | `planner.ts` | `planner.test.ts` | Built + tested |
| Lieutenant Planner (`createDetailedPlanWithDW`) | `lieutenant-planner.ts` | `lieutenant-planner.test.ts` | Built + tested |
| Developer/Writer (`generateAndPromote`) | `developer-writer.ts` | `developer-writer.test.ts` | Built + tested |
| Executor (`executeFromPlan`) | `executor.ts` | `executor.test.ts` | Built + tested |
| Rule-Based Reviewer (`reviewOutput`) | `reviewer.ts` | `reviewer.test.ts` | Built + tested |
| LLM Reviewer (`reviewWithLLM`) | `llm-reviewer.ts` | `llm-reviewer.test.ts` | Built + tested |
| Review HOF + `applyReview` | `reviewed.ts` | _(covered by orchestrator/integration tests)_ | Built + tested |
| Human-Judgment Agent (`handleFAFC`) | `human-judgment-agent.ts` | `human-judgment-agent.test.ts` | Built + tested |
| Review Log (`appendReviewLog`) | `review-log.ts` | `review-log.test.ts` | Built + tested |
| Reviewer-Reviewer (`auditReviewDecision`) | `reviewer-reviewer.ts` | `reviewer-reviewer.test.ts` | Built + tested |
| BIG_BROTHER (`triggerBigBrother`) | `big-brother.ts` | `big-brother.test.ts` | Built + tested |
| Sampling Rate | `sampling-rate.ts` | `sampling-rate.test.ts` | Built + tested |
| Semantic Review (`semanticReview`) | `semantic-review.ts` | `semantic-review.test.ts` | Built + tested (see Stubs section) |
| LLM Utils (`callWithValidation`, `extractJson`) | `llm-utils.ts` | `llm-utils.test.ts` | Built + tested |
| Base (`invokeAgent`, `buildSystemPrompt`) | `base.ts` | `base.test.ts` | Built + tested |
| Anthropic LLM Client | `claude-client.ts` | _(covered by integration tests)_ | Built + tested |
| Ollama LLM Client | `ollama-client.ts` | `ollama-client.test.ts` | Built + tested |
| **Prompt Builder** | `prompt-builder.ts` | **none** | **Built, untested** |

### Compiler and Script Runner (`src/compiler/`, `src/scripts/`)

| Module | Test File | Status |
|---|---|---|
| Compiler (`compile`) | `compiler/compiler.test.ts` | Built + tested |
| Script Runner (`runScript`) | `scripts/scripts.test.ts` | Built + tested |
| Script Index (`listScripts`) | `scripts/scripts.test.ts` | Built + tested |

### IO Adapters (`src/io/`)

| Module | Test File | Status |
|---|---|---|
| `CLIAdapter` | `io/CLIAdapter.test.ts` | Built + tested |
| `TestAdapter` | `io/TestAdapter.test.ts` | Built + tested |
| `IOAdapter` interface | _(interface only)_ | — |

### Jobs (`src/jobs/`)

| Module | Test File | Status |
|---|---|---|
| `scheduler.ts` | `jobs/scheduler.test.ts` | Built + tested |
| `store.ts` | `jobs/store.test.ts` | Built + tested |
| `defaultExecutor.ts` | `jobs/defaultExecutor.test.ts` | Built + tested |
| `types.ts` | _(type declarations only)_ | — |

### Identity (`src/identity/`)

| Module | Test File | Status |
|---|---|---|
| `loader.ts` | `identity/loader.test.ts` | Built + tested |
| `writer.ts` | `identity/writer.test.ts` | Built + tested |
| `anti-patterns.ts` | `identity/anti-patterns.test.ts` | Built + tested |

### Other

| Module | Test File | Status |
|---|---|---|
| `sessions.ts` | `sessions.test.ts` | Built + tested |
| `index.ts` (CLI REPL entry) | none | **Built, untested** |

---

## Stubbed / Scaffolded

### `src/agents/semantic-review.ts` — Partial stub

The `shouldSemanticReview()` gate only returns `true` for `mode === "always"`. The `"sampling"` and `"fast-path-only"` modes return `false` unconditionally — the conditional logic is not implemented.

```
shouldSemanticReview(): "sampling" and "fast-path-only" modes → always returns false (stub)
```

The `semanticReview()` LLM call itself is fully implemented. The gate is off by default — `compile()` receives no `semanticReview` options in the current pipeline (`executeFromPlan` calls `compile()` without passing any `CompileOptions`), so this path never runs in production.

**Wiring gap**: `executeFromPlan` in `executor.ts` calls `compile(instructionFile, scriptsDir)` without `CompileOptions`, so the semantic review gate is not reachable from the live pipeline even if `semanticReview.enabled = true` were set — there's no wiring between the identity context and the compile call.

### `src/agents/prompt-builder.ts` — No test coverage

`buildSystemPrompt()` is tested indirectly through `base.test.ts` (which calls `invokeAgent()` and asserts on the assembled prompt), but there is no dedicated `prompt-builder.test.ts`.

### `planner.ts` — Legacy `createPlan()` function

`createPlan()` (the original single-stage planner) is still exported alongside `createStrategicPlan()`. It is not called anywhere in the current pipeline (confirmed by code inspection — only `createStrategicPlan` is imported by `orchestrator.ts`). Dead code; tracked in OpenQuestions.md for cleanup.

---

## Agent Pipeline Topology

```
User input
  │
  ▼
handleRequest()  [orchestrator.ts]
  │  1. client.sendMessage → taskDescription (intent interpretation)
  │  2. applyReview(taskDescription) → reviewWithLLM() or reviewOutput()
  │  3. createStrategicPlan(taskDescription) → StrategicPlan {assignments[]}
  │
  ▼
createStrategicPlan()  [planner.ts]
  │  LLM call → JSON {id, description, assignments[{id, description, context, constraints}]}
  │  Writes STRATEGIC-{id}.md to plansDir
  │  Returns StrategicPlan
  │
  ▼ (per assignment)
Scheduler + DefaultJobExecutor  [jobs/scheduler.ts, jobs/defaultExecutor.ts]
  │  For each assignment: submit planJob → execJob (execJob depends on planJob)
  │  Scheduler resolves DAG, runs up to 3 concurrent jobs
  │  DefaultJobExecutor routes by job.type:
  │    "plan"           → createDetailedPlanWithDW()
  │    "execute_script" → executeFromPlan()
  │
  ▼
createDetailedPlanWithDW()  [lieutenant-planner.ts]
  │  1. createDetailedPlan() → LieutenantPlanResult {plan, missingScripts[]}
  │     LLM call → JSON plan with steps; "__missing__" scriptId for gaps
  │     Writes PLAN-{id}.md to plansDir
  │  2. if missingScripts.length > 0 (up to MAX_DW_CALLS=3):
  │       generateAndPromote() per missing script  [developer-writer.ts]
  │         LLM generates shell script with frontmatter
  │         stageScript() → runtime/staging/scripts/
  │         applyReview() → DW reviewer
  │         promoteScript() → src/instance/scripts/
  │       Re-run createDetailedPlan() with updated script index
  │  3. applyReview(planJson) → reviewWithLLM() or reviewOutput()
  │  Returns LieutenantPlanResult (no missing scripts if DW succeeded)
  │
  ▼
executeFromPlan()  [executor.ts]
  │  Validates plan via PlanSchema
  │  Filters steps to scripts that exist in scriptsDir
  │  Writes {planId}-instructions.json to plansDir
  │  Calls compile(instructionFile, scriptsDir)
  │
  ▼
compile()  [compiler/compiler.ts]
  │  Phase 1: Validate all steps (script exists, params declared in frontmatter)
  │  Phase 2: Semantic review gate (skipped — not wired in current pipeline)
  │  Phase 3: Execute steps in order via runScript()
  │    runScript() [scripts/runner.ts]: spawns shell, injects params as env vars
  │  Returns ScriptResult[] {scriptId, exitCode, stdout, stderr}
  │
  ▼ (back in orchestrator)
handleRequest() continued
  │  Collects all ScriptResult[] from all exec jobs
  │  client.sendMessage → natural-language response
  │  applyReview(response) → reviewWithLLM() or reviewOutput()
  │  Returns OrchestratorResult {response, provenance, sideEffects}
  │
  ▼ (fire-and-forget after response)
sampleAndAudit()  [reviewer-reviewer.ts]
  │  Samples 1 entry from runtime/logs/review-decisions.jsonl
  │  auditReviewDecision() → LLM call assessing constitutional consistency
  │  if flagged: triggerBigBrother()
  │    proposeConfigUpdate() → LLM → BBOutput {targetAgentId, configDelta}
  │    applyReview(proposal) → BB Reviewer
  │    applyConfigUpdate() → writeAgentConfig() or writeReviewerConfig()
  │      (atomic .pending → rename, backup to runtime/config-backups/)
  │    max 3 self-modification rounds

applyReview() [reviewed.ts]
  │  Sampling check: getRate() → may skip LLM, fall back to rule-based
  │  reviewWithLLM() [llm-reviewer.ts]:
  │    Passes SOUL.md + CONSTITUTION.md + reviewer config + anti-patterns to LLM
  │    Returns ReviewOutput {decision, reasoning, matchedRules}
  │  reviewOutput() [reviewer.ts] — fast rule-based fallback
  │  decision=fafc → handleFAFC() [human-judgment-agent.ts]
  │    LLM generates confirmation summary
  │    adapter.requestConfirmation() → user y/n
  │    allow or throw ReviewHaltError
  │  decision=flag-and-halt → throw ReviewHaltError
  │  Updates sampling rate state (recordClean / recordFlag)
  │  Logs decision to review-decisions.jsonl
```

---

## Active Adapters and Integrations

### IOAdapter Implementations

| Adapter | File | Wired into `src/index.ts`? |
|---|---|---|
| `CLIAdapter` | `src/io/CLIAdapter.ts` | **Yes** — `createCLIAdapter({ prompt: "writ>" })` is the entry-point adapter |
| `TestAdapter` | `src/io/TestAdapter.ts` | **No** — integration tests only; not imported by `index.ts` |

`src/index.ts` creates `CLIAdapter`, then passes it through to `handleRequest()` and the persistent `Scheduler`. All I/O routes through the adapter. The REPL starts on `adapter.start()`.

### LLM Providers

| Provider | File | Active by default | Env vars |
|---|---|---|---|
| Anthropic (Claude) | `src/agents/claude-client.ts` | **Yes** | `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` (default: `claude-haiku-4-5-20251001`) |
| Ollama (local) | `src/agents/ollama-client.ts` | No | `LLM_PROVIDER=ollama`, `OLLAMA_BASE_URL` (default: `http://localhost:11434`), `OLLAMA_MODEL` (default: `llama3.2`) |

`createLLMClient()` in `claude-client.ts` reads `LLM_PROVIDER`; if `"ollama"`, delegates to `createOllamaClient()`. Default is Anthropic. Both implement the same `LLMClient` interface (`sendMessage`, `sendMessages`).

---

## Test Coverage

### Unit Tests (`npm test`)

27 test files, **232 tests, all passing**.

| Test File | Tests | Coverage area |
|---|---|---|
| `agents/orchestrator.test.ts` | — | Orchestrator helpers, prompt building |
| `agents/planner.test.ts` | — | `createStrategicPlan`, `createPlan` |
| `agents/lieutenant-planner.test.ts` | 14 | `createDetailedPlan`, `detectMissingScripts`, `createDetailedPlanWithDW` |
| `agents/developer-writer.test.ts` | — | `generateScript`, `stageScript`, `promoteScript`, `generateAndPromote` |
| `agents/executor.test.ts` | — | `executeFromPlan` |
| `agents/reviewer.test.ts` | — | Rule-based `reviewOutput` |
| `agents/llm-reviewer.test.ts` | — | `reviewWithLLM` |
| `agents/human-judgment-agent.test.ts` | 5 | `handleFAFC` |
| `agents/reviewer-reviewer.test.ts` | — | `auditReviewDecision`, `sampleAndAudit` |
| `agents/big-brother.test.ts` | — | `proposeConfigUpdate`, `applyConfigUpdate`, `triggerBigBrother` |
| `agents/sampling-rate.test.ts` | — | `getRate`, `recordClean`, `recordFlag` |
| `agents/review-log.test.ts` | — | `appendReviewLog`, `buildLogEntry`, `readReviewLog` |
| `agents/semantic-review.test.ts` | 7 | `shouldSemanticReview`, `semanticReview`, `SemanticReviewError` |
| `agents/llm-utils.test.ts` | 7 | `extractJson`, `callWithValidation` |
| `agents/base.test.ts` | 6 | `invokeAgent`, `buildSystemPrompt` |
| `agents/ollama-client.test.ts` | — | Ollama HTTP client |
| `compiler/compiler.test.ts` | — | `compile`, `CompilerError` |
| `scripts/scripts.test.ts` | 7 | `runScript`, `listScripts` |
| `io/CLIAdapter.test.ts` | — | `createCLIAdapter` |
| `io/TestAdapter.test.ts` | 3 | `createTestAdapter` |
| `jobs/scheduler.test.ts` | — | `createScheduler`, DAG resolution |
| `jobs/store.test.ts` | — | `createJobStore`, job persistence |
| `jobs/defaultExecutor.test.ts` | — | `createDefaultJobExecutor`, job type routing |
| `identity/loader.test.ts` | — | `loadIdentity` |
| `identity/writer.test.ts` | — | `writeAgentConfig`, atomic writes |
| `identity/anti-patterns.test.ts` | 3 | `appendAntiPattern` |
| `sessions.test.ts` | 8 | `loadSession`, `saveSession` |

### Integration Tests (`npm run test:integration`)

1 test file (`src/integration/pipeline.integration.test.ts`), **15 tests, all passing**.

| Test | Description |
|---|---|
| 1. Basic Request → Response (×2) | End-to-end via `handleRequest()` with mock LLM; checks response + provenance chain |
| 2. Script Execution | Executes real bootstrap script (`git-status`), verifies output in response |
| 3. Review Chain Runs (×2) | LLM reviewer invoked; skipped when `skipReview=true` |
| 4. FAFC Privilege Escalation (×2) | FAFC routes through adapter confirm; halts on deny |
| 5. Developer/Writer Trigger | LP `__missing__` path triggers DW |
| 6. DefaultJobExecutor + Scheduler | Plan job via scheduler |
| 7. Orchestrator → Scheduler → DefaultJobExecutor | Full pipeline through scheduler |
| 8. Throbber Timeout (×2) | Slow jobs send ack + async result; fast jobs respond sync |
| 9. Multi-Job DAG Execution | DAG plan→execute dependency ordering |
| 10. Channel Routing | Jobs carry adapter channel |
| 11. Provenance Chain with Job IDs | `jobId` / `parentJobId` in provenance entries |

### No test coverage

- `src/agents/prompt-builder.ts` — no dedicated test file (indirectly tested via `base.test.ts`)
- `src/index.ts` — CLI entry point, no test file

---

## Known Gaps

Items with `[ ]` in Roadmap.md that have no code implementation at all:

### (12) User Statement Log — `[ ]`
No code in `src/statements/`. No store, no schema, no wiring into Orchestrator. Described in `docs/planning/backlog/backlog-statement-log.md`.

### (13) Initiative Table & Persistence — `[ ]`
No code in `src/initiatives/`. `job.type` includes `"initiative_setup"` in `src/jobs/types.ts` (the type constant exists) but there is no InitiativeBuilder agent, no initiative store, no cron trigger. Described in `docs/planning/backlog/backlog-initiative-table.md`.

### (14) Initiative System — `[ ]`
No InitiativeBuilder agent, no `registry.json` entry for it, no cron tick evaluation. Depends on (13).

### (15) Containerization — `[ ]` (Backlog)
No Dockerfile, no compose file.

### (16) Adjutant — `[ ]`
No `src/agents/adjutant.ts`, no registry entry, no scheduled maintenance logic.

### (19) USER.md / Get-to-know-the-user — `[ ]`
No USER.md file under `src/instance/identity/`, no onboarding loop in `index.ts`.

### Technical Debt (from Roadmap)
- Node 18 vitest engine warning (vitest 4.x wants Node 20+)
- No error recovery for Claude API failures (rate limits, network errors — will throw up the stack)
- `request-modifications` review decision is returned by reviewers but not acted on — there is no re-invocation loop; the decision is logged but the agent output is passed through unchanged
- Semantic review gate (`shouldSemanticReview`) not wired into `executeFromPlan` — even if enabled in config, unreachable from live pipeline
- Legacy `createPlan()` in `planner.ts` is dead code (not imported anywhere); tracked in OpenQuestions.md
