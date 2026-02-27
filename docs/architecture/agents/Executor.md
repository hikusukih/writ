# Executor

## Qualities

- **Editable by [*Agent*](../../../dictionary.md) during runtime**: Executor-Agent: Yes
- **Inputs**:
    - PLANXYZ.MD (from a planner)
    - ID or @name of the planner who requests changes
- **Outputs**: Instruction JSON only — consumed by the [*Compiler*](../../../dictionary.md), not executed directly
- **Class-specific reviewer**: Executor-[*Reviewer*](../../../dictionary.md) ([Review Interface](ReviewInterface.md) implementation)

## Function Structure

> See [Overview: What "Agent" Means Here](../Overview.md#what-agent-means-here) for the general pattern.

**The function** (`executeFromPlan()`): Receives a validated [*Plan*](../../../dictionary.md) object. Maps each plan step to instruction JSON — script IDs, parameters, execution order. The function may make an LLM call for ambiguous mappings, with Executor-*Agent*.md shaping how the LLM resolves ambiguity. Validates output against InstructionFile schema (Zod). Passes instruction JSON to the *Compiler*.

**Executor-*Agent*.md should contain**: How to map plan steps to script invocations, parameter naming conventions, ordering heuristics, how to handle plan steps that don't map cleanly to a single script. This is a lightweight config — the Executor's judgment surface is small by design.

**Caller provides** (Planner, via Orchestrator): A validated *Plan* object (structured data, not raw LLM text). The *Plan* is already reviewed before the Executor sees it.

## Responsibilities

- Translate plans into structured instruction JSON specifying script IDs, parameters, and execution order
- This agent can do nothing other than produce instruction JSON
- Its input is always from a planner
- Its output is consumed by the **Compiler** (a static, deterministic component — not LLM-backed, not editable by agents), which converts instruction JSON into executable scripts
- Called by orchestrator, or by a second-order planner after the first-order one generates a PLANXYZ.MD
- PLANXYZ.MD is of course reviewed by reviewer

## Output Contract

The Executor's only output is instruction JSON. It does not execute anything, does not receive feedback, and does not learn from prior invocations. If the Executor's output is incorrect, it is re-invoked with the original inputs (maybe with a more capabale LLM model) — it is a stateless utility, not a learning agent.

## *Compiler*

The Executor's instruction JSON is consumed by the **Compiler**, a static deterministic function (not LLM-backed, not editable by agents). By the time the *Compiler* sees the instruction JSON, trust has been established twice:

1. The instruction JSON was reviewed by Executor-*Reviewer*
2. The scripts it references are already in the vetted local repo (written or approved through the Developer/Writer + Developer-*Reviewer* pipeline)

There is no further interpretation to do. The *Compiler* is mechanical — like a real compiler, it translates from one representation to another, validates structure, and rejects malformed input. It does not decide whether the instructions are a good idea.

**What the *Compiler* does:**

1. **Validates structurally**: Confirms every scriptId exists in the local script repo. Validates params against script frontmatter declarations. Rejects malformed or incomplete instructions. This is structural validation, not judgment.
2. **Composes a shell script**: Takes the instruction JSON and produces a shell script that calls the referenced scripts in order with the specified params. The scripts are already trusted — the *Compiler* is just wiring them together.
3. **Runs the composed script**: Executes it directly (no deposit-and-wait — the *Compiler* calls through to execution). Captures stdout, stderr, exit codes from each step.
4. **Logs what it ran**: Records the composed script and its results to the append-only log.
5. **Returns results up the chain**: Passes script results back to the Executor, which passes them to the Orchestrator.

The *Compiler* is the last step before side effects. Everything upstream is text; the *Compiler* is where intent becomes action.

## *Compiler* Interface

**Script Versioning**: Always use the latest version of a script. Versioning exists for post-analysis only — no version pinning during execution.

**Open questions**:
- Exact JSON schema for executor output
- How the *Compiler* handles failures mid-sequence (stop on first error? continue and collect? configurable per step?)

## Execution Model

[*Script*](../../../dictionary.md) get run with the permissions of a user on the box, added during install. Allows for some system logging traces.

Some scripts require root elevation. Authentication for elevation is handled before the "run it" stage — the pre-execution auth flow is an open question tracked in [OpenQuestions.md §5b](../../planning/OpenQuestions.md#5b-executor--script-runner-interface).

The Planner agent who requests the change has a set of permissions to run different [*AgentOS*](../../../dictionary.md) commands via Executor. A Lieutenant lacks permission/authority to run an update to SOUL/CONSTITUTION, but [Orchestrator](Orchestrator.md) can.
