# Tier 1 — Foundation: Human-Judgment Agent (HJA) + Anti-Pattern Lists

Implementation tasks for Phase 3, Tier 1. These are cheap, near-zero behavior change items that unlock or de-risk everything downstream.

## Relevant Files

- `src/types.ts` - Add FAFC review decision, HJA types, anti-pattern types to IdentityContext
- `src/schemas.ts` - Update ReviewerResponseSchema to accept "fafc" decision
- `src/agents/human-judgment-agent.ts` - Human-Judgment Agent: FAFC presentation + confirmation flow
- `src/agents/human-judgment-agent.test.ts` - Tests for HJA
- `src/agents/reviewed.ts` - Wire FAFC decision handling into applyReview()
- `src/agents/reviewed.test.ts` - Update review tests for FAFC path
- `src/agents/llm-reviewer.ts` - Include anti-patterns in reviewer prompt
- `src/agents/llm-reviewer.test.ts` - Update reviewer tests for anti-patterns
- `src/io/IOAdapter.ts` - Add requestConfirmation() to interface
- `src/io/CLIAdapter.ts` - Implement requestConfirmation() for CLI
- `src/io/CLIAdapter.test.ts` - Tests for confirmation prompt
- `src/identity/loader.ts` - Load anti-pattern files into IdentityContext
- `src/identity/loader.test.ts` - Update loader tests for anti-patterns
- `src/agents/orchestrator.ts` - Pass IOAdapter to handleRequest for HJA flow
- `src/index.ts` - Pass adapter to orchestrator
- `src/instance/identity/anti-patterns/` - Directory for per-agent anti-pattern files

### Notes

- Unit tests should be placed alongside source files (`foo.ts` / `foo.test.ts`).
- Run tests with `npm test` (vitest).
- HJA is infrastructure, not an LLM-invoked agent. It's a function called by the orchestrator when a reviewer returns FAFC.
- Anti-pattern files start empty — they'll be populated later by BIG_BROTHER (Tier 3).

## Tasks

- [x] 1.0 Add FAFC review decision to type system and schemas
  - [x] 1.1 Add `"fafc"` to `ReviewDecision` union type in `src/types.ts`
  - [x] 1.2 Update `ReviewerResponseSchema` in `src/schemas.ts` to accept `"fafc"` as a valid decision
  - [x] 1.3 Update `REVIEWER_SYSTEM_PREAMBLE` in `src/agents/llm-reviewer.ts` to describe the FAFC decision
  - [x] 1.4 Add `summary?: string` field to `ReviewResult` type
  - [x] 1.5 Update `ReviewerResponseSchema` to include optional `summary` field
  - [x] 1.6 Update existing reviewer tests to verify FAFC is a valid parsed decision

- [x] 2.0 Add requestConfirmation() to IOAdapter interface
  - [x] 2.1 Add `requestConfirmation(summary: string, details?: string): Promise<boolean>` to `IOAdapter` interface
  - [x] 2.2 Implement `requestConfirmation()` in `CLIAdapter` with `[y/N]` prompt, default deny
  - [x] 2.3 Write tests for CLIAdapter.requestConfirmation() — approve/deny/EOF/empty/details paths

- [x] 3.0 Implement HJA module
  - [x] 3.1 Create `src/agents/human-judgment-agent.ts` with `handleFAFC()` function
  - [x] 3.2 Write tests for handleFAFC() — LLM summary, fallback, approve/deny, LLM failure paths

- [x] 4.0 Wire FAFC into the review chain
  - [x] 4.1 Refactor `applyReview()` to use ReviewOptions object pattern
  - [x] 4.2 FAFC handling: adapter → HJA, no adapter → halt (backward compat)
  - [x] 4.3 Update `handleRequest()` to accept and pass IOAdapter through
  - [x] 4.4 Update `src/index.ts` to pass adapter to `handleRequest()`
  - [x] 4.5 Migrate all existing test call sites to options object
  - [x] 4.6 Integration tests: FAFC approve → continues, FAFC deny → halt, FAFC no adapter → halt

- [x] 5.0 Anti-pattern file structure and loading
  - [x] 5.1 Create directory `src/instance/identity/anti-patterns/`
  - [x] 5.2 Create starter files for orchestrator, planner, executor with header comments
  - [x] 5.3 Add `antiPatterns?: Record<string, string>` to `IdentityContext`
  - [x] 5.4 Update `loadIdentity()` to scan anti-patterns directory
  - [x] 5.5 Tests: present files loaded, missing directory graceful, agent ID extraction

- [x] 6.0 Wire anti-patterns into LLM reviewer
  - [x] 6.1 Update `reviewWithLLM()` to accept and include anti-patterns in prompt
  - [x] 6.2 Update `applyReview()` to look up and pass anti-patterns
  - [x] 6.3 Tests: prompt includes/omits anti-patterns, empty string handling

- [x] 7.0 Agent input validation (retroactive hardening)
  - [x] 7.1 Add `InstructionFileSchema.parse()` at top of `compile()`
  - [x] 7.2 Add `PlanSchema.parse()` at top of `executeFromPlan()`
  - [x] 7.3 Tests: malformed inputs throw ZodError at boundary

- [x] 8.0 LLM call-with-validation utility (shared infrastructure)
  - [x] 8.1 Create `src/agents/llm-utils.ts` with shared `extractJson()` — deduped from planner/reviewer
  - [x] 8.2 Add `callWithValidation()` with retry + error feedback to LLM
  - [x] 8.3 Refactor `createPlan()` to use `callWithValidation()`
  - [x] 8.4 Refactor `reviewWithLLM()` to use `callWithValidation()` (rule-based fallback preserved)
  - [x] 8.5 Tests: retry success, retry exhaustion, error in retry message, maxRetries=0, fenced JSON

- [x] 9.0 Create appendAntiPattern utility for future use
  - [x] 9.1 Create `src/identity/anti-patterns.ts` with `appendAntiPattern()` function
  - [x] 9.2 Tests: append to existing, create new, timestamp format
