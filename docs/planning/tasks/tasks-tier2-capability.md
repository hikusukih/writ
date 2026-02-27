# Tier 2 — Capability Expansion: Developer/Writer + Lieutenant Planner

Implementation tasks for Phase 3, Tier 2. Expands what the system can do; required for the self-improvement chain to be meaningful.

**Important dependency**: Tier 1 (Human-Judgment Agent (HJA) + Anti-patterns) should be complete before starting Tier 2. Developer/Writer needs a working LLM reviewer chain (already built) and anti-pattern lists (Tier 1) to safely commission and validate new scripts.

## Relevant Files

- `src/agents/developer-writer.ts` - Script authoring agent: generates scripts from capability descriptions
- `src/agents/developer-writer.test.ts` - Tests for Developer/Writer
- `src/agents/lieutenant-planner.ts` - Tactical planner: produces script-level execution specs
- `src/agents/lieutenant-planner.test.ts` - Tests for Lieutenant Planner
- `src/agents/planner.ts` - Refactor existing createPlan() to be more strategic (General Planner role)
- `src/agents/planner.test.ts` - Update planner tests for refactored interface
- `src/agents/orchestrator.ts` - Wire GP → LP → Executor chain
- `src/agents/orchestrator.test.ts` - Update orchestrator tests for new pipeline
- `src/types.ts` - Add DeveloperWriterResult, StrategicPlan types
- `src/schemas.ts` - Add schemas for new types
- `src/instance/identity/registry.json` - Register developer-writer and lieutenant-planner agents
- `src/instance/identity/agents/developer-writer-agent.md` - Agent config for Developer/Writer
- `src/instance/identity/agents/developer-writer-reviewer-agent.md` - Reviewer config for DW output
- `src/instance/identity/agents/lieutenant-planner-agent.md` - Agent config for Lieutenant Planner
- `src/instance/identity/agents/lieutenant-planner-reviewer-agent.md` - Reviewer config for LP output
- `src/instance/identity/anti-patterns/anti-patterns-developer-writer.md` - Anti-pattern list for DW
- `src/instance/identity/anti-patterns/anti-patterns-lieutenant-planner.md` - Anti-pattern list for LP

### Notes

- Developer/Writer generates scripts that go through review before being added to the live script index.
- Lieutenant Planner validates feasibility against available scripts and commissions missing scripts via Developer/Writer.
- The General Planner refactor changes its role from "pick specific scripts" to "partition work into assignments."
- All requests use the full GP → LP → Executor pipeline. Fast-path (simple requests skip LP) is a future optimization, not a Tier 2 deliverable.

## Tasks

- [x] 1.0 Developer/Writer agent setup
  - [x] 1.1 Add `developer-writer` entry to `registry.json`
  - [x] 1.2 Create `developer-writer-agent.md` with script generation prompt + examples
  - [x] 1.3 Create `developer-writer-reviewer-agent.md` with 10-point review checklist
  - [x] 1.4 Create empty `anti-patterns-developer-writer.md`

- [x] 2.0 Implement Developer/Writer module
  - [x] 2.1 Define `DeveloperWriterRequest` type in `src/types.ts`: `{ capability: string, existingScripts: ScriptInfo[], context?: string }`. Add corresponding `DeveloperWriterRequestSchema` in `src/schemas.ts`.
  - [x] 2.2 Define `DeveloperWriterResult` type: `{ scriptContent: string, scriptName: string, testSuggestions?: string }`. Add corresponding `DeveloperWriterResultSchema` in `src/schemas.ts`.
  - [x] 2.3 Create `src/agents/developer-writer.ts` with function: `generateScript(client: LLMClient, request: DeveloperWriterRequest, identity: IdentityContext): Promise<DeveloperWriterResult>`. Validate input with `DeveloperWriterRequestSchema.parse(request)` at entry. Build prompt from DW agent config + request. LLM generates script content with frontmatter. Parse and validate frontmatter from generated content. Validate output with `DeveloperWriterResultSchema.parse()`. Return result.
  - [x] 2.4 Add script staging function: `stageScript(content: string, scriptsDir: string): Promise<string>`. Writes to `runtime/staging/scripts/{name}.sh`. Returns the staging path.
  - [x] 2.5 Add script promotion function: `promoteScript(stagingPath: string, scriptsDir: string, options?: { onPromote?: () => void }): Promise<ScriptInfo>`. Moves from staging to live `src/instance/scripts/`. Re-parses frontmatter to confirm validity. Calls `onPromote()` if provided (Tier 3 will wire this to `resetOnContextChange()` for sampling rate). Returns the new ScriptInfo.
  - [x] 2.6 Wire review into the DW flow: after `generateScript()`, call `applyReview()` on the script content using the developer-writer reviewer config. If review passes, stage and promote. If FAFC, route through HJA. If halt, reject. (`generateAndPromote()` orchestrates the full pipeline.)
  - [x] 2.7 Write tests: mock LLM generates valid script → parsed correctly. Frontmatter validation. Review approval → promotion. Review rejection → no promotion. Staging directory created. Existing script name collision detection.

- [x] 3.0 Lieutenant Planner agent setup
  - [x] 3.1 Add `lieutenant-planner` entry to `registry.json`: id "lieutenant-planner", class "planner", configFile "lieutenant-planner-agent.md"
  - [x] 3.2 Create `src/instance/identity/agents/lieutenant-planner-agent.md`: LLM prompt for tactical planning. Include: you receive a single work assignment from the General Planner, produce a detailed execution spec using available scripts. If a needed script doesn't exist, describe what it should do (Developer/Writer will create it). Use `@name` references for scripts. Decompose to junior-developer granularity.
  - [x] 3.3 Create `src/instance/identity/agents/lieutenant-planner-reviewer-agent.md`: review guidance for LP output. Check: all referenced scripts exist (or are flagged for creation), params match script frontmatter, plan is feasible and complete, no unnecessary steps.
  - [x] 3.4 Create empty `src/instance/identity/anti-patterns/anti-patterns-lieutenant-planner.md`

- [x] 4.0 Implement Lieutenant Planner module
  - [x] 4.1 Define `WorkAssignment` type in `src/types.ts`: `{ id: string, description: string, context?: string, constraints?: string[] }`. Add corresponding `WorkAssignmentSchema` in `src/schemas.ts`.
  - [x] 4.2 Create `src/agents/lieutenant-planner.ts` with function: `createDetailedPlan(client: LLMClient, assignment: WorkAssignment, identity: IdentityContext, scriptsDir: string, plansDir: string): Promise<Plan>`. Validate input with `WorkAssignmentSchema.parse(assignment)` at entry. Similar to current `createPlan()` but receives a single work assignment instead of a raw task description. Reads script index. Produces Plan with script-level steps.
  - [x] 4.3 Add missing-script detection: after plan generation, check if any step references a script not in the index. Return a list of missing scripts alongside the plan: `{ plan: Plan, missingScripts: { name: string, capability: string }[] }`.
  - [x] 4.4 Wire Developer/Writer integration: when LP detects missing scripts, call `generateScript()` for each → review → promote → re-plan with new scripts available. Cap at 3 DW calls per LP invocation to prevent runaway generation.
  - [x] 4.5 Review LP output via `applyReview()` with lieutenant-planner reviewer config.
  - [x] 4.6 Write tests: mock LLM → valid plan. Missing script detection. DW integration (mock). Re-plan after script creation. Cap enforcement.

- [x] 5.0 Refactor General Planner to strategic role
  - [x] 5.1 Define `StrategicPlan` type in `src/types.ts`: `{ id: string, description: string, assignments: WorkAssignment[] }`. This is what the GP now produces — work assignments for the LP, not script-level steps.
  - [x] 5.2 Add `StrategicPlanSchema` to `src/schemas.ts` for Zod validation (composes `WorkAssignmentSchema`).
  - [x] 5.3 Create `createStrategicPlan()` in `src/agents/planner.ts`: similar to current `createPlan()` but prompt asks for high-level work partitioning, not specific scripts. LLM response is a StrategicPlan with WorkAssignments. The existing `createPlan()` is superseded by `createStrategicPlan()`. It may remain in the codebase for reference but is no longer called from `handleRequest()`.
  - [x] 5.4 Update `planner-agent.md` to describe the strategic role: partition work, identify what needs to happen at a high level, don't pick specific scripts (that's LP's job).
  - [x] 5.5 Write tests for `createStrategicPlan()`.

- [x] 6.0 Wire the full pipeline: GP → LP → Executor
  - [x] 6.1 Update `handleRequest()` in orchestrator.ts to use the new pipeline for all requests: `createStrategicPlan()` → (for each assignment) → `createDetailedPlan()` → `executeFromPlan()`. No fast-path — all requests go through GP → LP → Executor.
  - [x] 6.2 Implement the full pipeline in orchestrator: `createStrategicPlan()` → for each assignment, `createDetailedPlan()` → for each detailed plan, `executeFromPlan()`. Collect all execution results. Update provenance chain with GP + LP entries.
  - [x] 6.3 Handle multi-assignment results: if GP produces multiple assignments, collect results from all LP → Executor chains. Synthesize a combined response.
  - [x] 6.4 Update `buildResponsePrompt()` to handle multiple execution results.
  - [x] 6.5 Write integration tests: end-to-end GP → LP → Executor with mocked LLM. Multi-assignment test. DW trigger test (LP detects missing script).
  - [x] 6.6 Update existing orchestrator tests to work with the new GP → LP → Executor pipeline.
