Inspect the actual codebase and generate a State of System report as conversational output. Do NOT copy from other docs — derive everything by reading source files directly. Do NOT write to any file.

Work through each section below, then print the full report in the conversation.

---

## Section 1: What's built and working

For each agent in `src/agents/`, check:
1. Does a corresponding test file exist (`*.test.ts`)?
2. Run `npm test` — do those tests pass?

List agents/components as **built and tested** only if tests exist AND pass. List as **built, untested** if the file exists but has no test coverage.

Also check `src/compiler/`, `src/scripts/`, `src/io/`, `src/jobs/`, `src/sessions.ts`, `src/identity/`.

## Section 2: What's stubbed or scaffolded

Look for:
- Files with functions that `return null`, `return {}`, throw `new Error('not implemented')`, or have bodies that are just comments
- Files imported in the pipeline but whose functions are never called with real data
- Specifically check `src/agents/semantic-review.ts` (known stub)

Report each as: file path, function name, nature of stub.

## Section 3: Agent pipeline topology

Read these files to reconstruct the actual call graph:
- `src/agents/orchestrator.ts` — what does `handleRequest()` call?
- `src/agents/planner.ts` — what does `createStrategicPlan()` call?
- `src/agents/lieutenant-planner.ts` — what does `createDetailedPlanWithDW()` call?
- `src/agents/executor.ts` — what does `executeFromPlan()` call?
- `src/compiler/compiler.ts` — what does `compile()` call?
- `src/agents/reviewed.ts` — what does `applyReview()` call?

Draw the pipeline as a text diagram showing: agent name → what it calls → what returns.

## Section 4: Active adapters and integrations

Read `src/io/`:
- List each IOAdapter implementation and whether it's wired into `src/index.ts`
- Note TestAdapter (integration tests only)

Read `src/agents/claude-client.ts` and `src/agents/ollama-client.ts`:
- Which providers are implemented?
- Which is active by default?
- What env vars control switching?

## Section 5: Test coverage summary

Run `npm test -- --reporter=verbose 2>&1` and `npm run test:integration -- --reporter=verbose 2>&1`

Report:
- Total test files
- Total tests (pass/fail/skip) per suite
- Which agents/components have test coverage vs. none

## Section 6: Known gaps and tech debt

Read `docs/planning/OpenQuestions.md`.

List components or features referenced in architecture docs that have no corresponding code. These are genuine gaps.

---

## Output

Print the complete report to the conversation with this structure:

```markdown
# State of System

_Generated: <today's date>. Reflects actual codebase — not aspirational docs._

## Built and Working
...

## Stubbed / Scaffolded
...

## Agent Pipeline Topology
...

## Active Adapters and Integrations
...

## Test Coverage
...

## Known Gaps
...
```
