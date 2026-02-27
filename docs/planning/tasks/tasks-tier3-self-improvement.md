# Tier 3 — Self-Improvement Chain

Implementation tasks for Phase 3, Tier 3. Strict internal order: Reviewer-Reviewer → BIG_BROTHER → Review Sampling Rate → XYZ-AGENT.md Self-Modification → Pre-Execution Semantic Review.

**Important dependency**: Tiers 1–2 must be complete. Human-Judgment Agent (HJA) is needed to gate elevated BIG_BROTHER actions. Anti-pattern lists must be loadable. Developer/Writer and Lieutenant Planner should be working so BIG_BROTHER has real reviewer data to operate on.

## Relevant Files

- `src/agents/reviewer-reviewer.ts` - Reviewer-Reviewer: samples and audits reviewer decisions
- `src/agents/reviewer-reviewer.test.ts` - Tests for RR
- `src/agents/big-brother.ts` - BIG_BROTHER: updates agent configs based on RR flags
- `src/agents/big-brother.test.ts` - Tests for BIG_BROTHER
- `src/agents/sampling-rate.ts` - Review sampling rate state management
- `src/agents/sampling-rate.test.ts` - Tests for sampling rate
- `src/agents/semantic-review.ts` - Pre-execution semantic review gate
- `src/agents/semantic-review.test.ts` - Tests for semantic review
- `src/types.ts` - ViolationSummary, SamplingRateState, SemanticReviewResult types
- `src/schemas.ts` - Schemas for new types
- `src/agents/reviewed.ts` - Integrate sampling rate into review chain
- `src/agents/llm-reviewer.ts` - Feed review decisions to RR sampling stream
- `src/compiler/compiler.ts` - Insert semantic review gate before execution
- `src/identity/loader.ts` - Support self-modification writes
- `src/instance/identity/registry.json` - Register new agents
- `src/instance/identity/agents/reviewer-reviewer-agent.md` - RR agent config (OS class, hardcoded path)
- `src/instance/identity/agents/big-brother-agent.md` - BB agent config
- `src/instance/identity/agents/big-brother-reviewer-agent.md` - BB reviewer config

### Notes

- Reviewer-Reviewer is OS class (immutable at runtime). Its config path is hardcoded, not in the mutable registry pattern.
- BIG_BROTHER receives generalized violation summaries — NEVER raw task content.
- The self-modification loop has a hard cap of 3 rounds.
- Pre-Execution Semantic Review is stubbed with a configurable gate (always-off initially) since we need real reviewer flag data before designing the trigger.

## Tasks

- [x] 1.0 Review decision logging infrastructure
  - [x] 1.1 Define `ReviewLogEntry` type in `src/types.ts`: `{ timestamp: string, subjectAgentId: string, decision: ReviewDecision, reasoning: string, reviewerType: "rule" | "llm", contentHash: string }`. The contentHash is a SHA-256 of the reviewed content (not the content itself — privacy).
  - [x] 1.2 Create `src/agents/review-log.ts` with functions: `appendReviewLog(entry: ReviewLogEntry, logsDir: string): Promise<void>` (appends to `runtime/logs/review-decisions.jsonl`) and `readReviewLog(logsDir: string, limit?: number): Promise<ReviewLogEntry[]>` (reads last N entries).
  - [x] 1.3 Update `reviewWithLLM()` in `src/agents/llm-reviewer.ts`: after getting a decision, call `appendReviewLog()` with the decision metadata.
  - [x] 1.4 Update `reviewOutput()` in `src/agents/reviewer.ts`: same — log rule-based decisions.
  - [x] 1.5 Write tests for review-log: append, read, limit, empty file handling.

- [x] 2.0 Reviewer-Reviewer agent setup
  - [x] 2.1 Add `reviewer-reviewer` entry to `registry.json`: id "reviewer-reviewer", class "os", configFile "reviewer-reviewer-agent.md"
  - [x] 2.2 Create `src/instance/identity/agents/reviewer-reviewer-agent.md`: OS-class prompt. Role: audit sampled reviewer decisions for constitutional consistency. Input: the reviewer's decision + reasoning (NOT the original task content). Evaluate: does the decision align with SOUL + CONSTITUTION? Output: JSON with `{ consistent: boolean, override?: ReviewDecision, violationSummary?: string }`. The violationSummary must describe the error CLASS in constitutional terms — no task quotes, no reconstructed agent output.

- [x] 3.0 Implement Reviewer-Reviewer module
  - [x] 3.1 Define `RRInput` type: `{ reviewLogEntry: ReviewLogEntry, soul: string, constitution: string }`. Add `RRInputSchema` in `src/schemas.ts`.
  - [x] 3.2 Define `RROutput` type: `{ consistent: boolean, override?: ReviewDecision, violationSummary?: string }`. Add `RROutputSchema` in `src/schemas.ts`.
  - [x] 3.3 Create `src/agents/reviewer-reviewer.ts` with function: `auditReviewDecision(client: LLMClient, input: RRInput, identity: IdentityContext): Promise<RROutput>`. Validate input with `RRInputSchema.parse(input)` at entry. Build prompt from RR agent config + SOUL + CONSTITUTION. Send the review decision + reasoning to LLM. Validate response with `RROutputSchema.parse()`. Return RROutput.
  - [x] 3.4 Add sampling function: `sampleAndAudit(client: LLMClient, identity: IdentityContext, adapter: IOAdapter, logsDir: string, sampleRate: number): Promise<RROutput | null>`. Reads review log. Samples one entry based on rate. If sampled, calls `auditReviewDecision()`. Returns result or null if no sample taken. Accepts `adapter` so it can be passed through to BIG_BROTHER for FAFC routing.
  - [x] 3.5 Wire RR into the main loop: after each `handleRequest()` completes in `src/index.ts`, call `sampleAndAudit(client, identity, adapter, logsDir, sampleRate)` (fire-and-forget, don't block the REPL). The adapter is available at module scope in index.ts. Log RR results to `runtime/logs/rr-audit.jsonl`.
  - [x] 3.6 Handle RR flags: when `consistent: false`, log the violation. If `override` is provided, log that the original decision was overridden (the override doesn't retroactively change anything — it's a signal for BIG_BROTHER). Call `triggerBigBrother()` with adapter for FAFC routing (see task 5.0).
  - [x] 3.7 Write tests: mock LLM → consistent decision. Mock LLM → inconsistent + override. Sampling logic (rate=1 always samples, rate=0 never samples). Fire-and-forget doesn't block.

- [x] 4.0 BIG_BROTHER agent setup
  - [x] 4.1 Add `big-brother` entry to `registry.json`: id "big-brother", class "action", configFile "big-brother-agent.md"
  - [x] 4.2 Create `src/instance/identity/agents/big-brother-agent.md`: Action agent prompt. Role: diagnose constitutional inconsistencies in agent/reviewer configs and propose updated text. Input: flagged reviewer config + flagged agent config + generalized violation summary + SOUL + CONSTITUTION. Output: proposed updated config text. Guidance: distinguish meaningful improvement from superficial rewording, focus on the constitutional principle violated, write clear behavioral instructions.
  - [x] 4.3 Create `src/instance/identity/agents/big-brother-reviewer-agent.md`: Review guidance for BB output. Check: proposed changes address the flagged violation, changes don't introduce new problems, changes are substantive (not just rewording), changes don't contradict CONSTITUTION or SOUL.

- [x] 5.0 Implement BIG_BROTHER module
  - [x] 5.1 Define `ViolationSummary` type in `src/types.ts`: `{ violatedPrinciple: string, errorClass: string, affectedAgentId: string, affectedReviewerId?: string }`. Note: NO task content fields. This is a structural constraint. Add `ViolationSummarySchema` in `src/schemas.ts`.
  - [x] 5.2 Define `BBInput` type: `{ violation: ViolationSummary, agentConfig: string, reviewerConfig?: string, soul: string, constitution: string }`. Add `BBInputSchema` (composes `ViolationSummarySchema`).
  - [x] 5.3 Define `BBOutput` type: `{ updatedAgentConfig?: string, updatedReviewerConfig?: string, changeRationale: string }`. Add `BBOutputSchema`.
  - [x] 5.4 Create `src/agents/big-brother.ts` with function: `proposeConfigUpdate(client: LLMClient, input: BBInput, identity: IdentityContext): Promise<BBOutput>`. Validate input with `BBInputSchema.parse(input)` at entry. Build prompt from BB agent config + input context. LLM proposes updated config text. Validate with `BBOutputSchema.parse()`. Return BBOutput.
  - [x] 5.5 Add review + apply cycle: `applyConfigUpdate(client: LLMClient, bbOutput: BBOutput, identity: IdentityContext, adapter: IOAdapter, identityDir: string): Promise<boolean>`. Review BB's output via `applyReview()` with big-brother-reviewer config. If FAFC, route through HJA (elevated action — modifying agent configs). If approved, write updated config to disk. Return success boolean.
  - [x] 5.6 Implement self-modification loop: if BB-Reviewer flags BB's own output, BB can propose an update to its own `big-brother-agent.md`. Hard cap: 3 rounds. After 3 failures, surface to user via IOAdapter.sendError() with explanation.
  - [x] 5.7 Wire BB trigger: create `triggerBigBrother(violation: ViolationSummary, client: LLMClient, identity: IdentityContext, adapter: IOAdapter, identityDir: string): Promise<void>`. Called by RR when a flag is raised. Loads relevant agent + reviewer configs, calls `proposeConfigUpdate()`, then `applyConfigUpdate()`.
  - [x] 5.8 Write tests: mock LLM → valid config update. Review approval → config written. Review rejection → no write. Self-modification loop (1 round, 2 rounds, 3-round cap). ViolationSummary type enforcement (no task content fields).

- [x] 6.0 Review Sampling Rate System
  - [x] 6.1 Define `SamplingRateState` type in `src/types.ts`: `{ rates: Record<string, { rate: number, cleanCount: number, lastFlagTimestamp?: string }>, defaults: { floor: number, osFloor: number, initialRate: number, decayPerClean: number } }`
  - [x] 6.2 Create `src/agents/sampling-rate.ts` with functions:
    - `loadSamplingState(runtimeDir: string): Promise<SamplingRateState>` — loads from `runtime/review-state.json`, returns defaults if missing
    - `saveSamplingState(state: SamplingRateState, runtimeDir: string): Promise<void>`
    - `getRate(state: SamplingRateState, agentId: string, agentClass: AgentClass): number` — returns current rate for agent. OS-class agents use osFloor minimum.
    - `recordClean(state: SamplingRateState, agentId: string, agentClass: AgentClass): SamplingRateState` — increment cleanCount, decay rate toward floor
    - `recordFlag(state: SamplingRateState, agentId: string): SamplingRateState` — reset rate to initialRate, clear cleanCount
    - `resetOnContextChange(state: SamplingRateState, agentId: string): SamplingRateState` — reset to high rate (triggered by config edits, new scripts, etc.)
  - [x] 6.3 Integrate into review chain: add `samplingState?: SamplingRateState` to the `ReviewOptions` object (created in Tier 1 task 4.1). In `applyReview()`, check sampling rate before calling `reviewWithLLM()`. If `Math.random() > rate`, skip LLM review (still run rule-based — this means FAFC is not possible for sampled-out reviews, which is by design: trusted agents with clean track records don't trigger FAFC). After review, call `recordClean()` or `recordFlag()` based on decision.
  - [x] 6.4 Wire context-change triggers: when BIG_BROTHER modifies a config, call `resetOnContextChange()` for the affected agent. When a new script is added (Developer/Writer), reset for planner and executor.
  - [x] 6.5 Configure defaults: `floor: 0.05` (5% minimum), `osFloor: 0.15` (15% for OS-class), `initialRate: 1.0` (100% after flag), `decayPerClean: 0.05` (5% reduction per clean invocation).
  - [x] 6.6 Write tests: rate decay math, floor enforcement, OS-class floor, flag reset, context change reset, persistence round-trip.

- [x] 7.0 XYZ-AGENT.md Self-Modification infrastructure
  - [x] 7.1 Create `src/identity/writer.ts` with function: `writeAgentConfig(identityDir: string, agentId: string, content: string): Promise<void>`. Writes to `agents/{configFile}` path. Validates content is non-empty and looks like a markdown agent config (basic sanity — has a heading, isn't just whitespace).
  - [x] 7.2 Add `writeReviewerConfig(identityDir: string, agentId: string, content: string): Promise<void>` — same for `{agentId}-reviewer-agent.md`.
  - [x] 7.3 Both functions should: (a) write to a `.pending` temp file first, (b) call `resetOnContextChange()` for the affected agent, (c) rename `.pending` to final path (atomic-ish on most filesystems). This prevents half-written configs.
  - [x] 7.4 Wire into BIG_BROTHER's `applyConfigUpdate()` — use these writer functions instead of raw fs writes.
  - [x] 7.5 Add revert capability: before writing, copy current config to `runtime/config-backups/{agentId}-{timestamp}.md`. BIG_BROTHER can reference this for rollback.
  - [x] 7.6 Write tests: write + read round-trip, pending file cleanup, backup creation, invalid content rejection.

- [x] 8.0 Pre-Execution Semantic Review (stubbed gate)
  - [x] 8.1 Define `SemanticReviewResult` type in `src/types.ts`: `{ approved: boolean, concerns?: string[], planAlignment: "aligned" | "divergent" | "unclear" }`
  - [x] 8.2 Create `src/agents/semantic-review.ts` with function: `semanticReview(client: LLMClient, composedScript: string, planDescription: string, identity: IdentityContext): Promise<SemanticReviewResult>`. Sends the composed shell script + the plan description to LLM. Asks: "Does this script do what the plan says it should do?" Returns structured result.
  - [x] 8.3 Add gate function: `shouldSemanticReview(config: { enabled: boolean, mode: "always" | "sampling" | "fast-path-only" }): boolean`. Initially: `enabled: false`. When enabled, mode determines when review triggers. Returns boolean.
  - [x] 8.4 Wire into compiler: extend `compile()` signature with an options object: `compile(instructions, scriptsDir, options?: CompileOptions)` where `CompileOptions = { semanticReview?: { client: LLMClient, identity: IdentityContext, enabled: boolean, mode: string } }`. After validation but before execution, call `shouldSemanticReview()`. If true and client is available, call `semanticReview()`. If `approved: false`, throw a new `SemanticReviewError`. Note: Tier 4's DefaultJobExecutor should pass these options through when calling compile() via executeFromPlan().
  - [x] 8.5 Add `SEMANTIC_REVIEW` env var: when set to "on", enables the gate. Default: off.
  - [x] 8.6 Write tests: gate off → no review. Gate on → LLM called → approved → execution proceeds. Gate on → LLM called → rejected → SemanticReviewError thrown. Mock LLM response parsing.
