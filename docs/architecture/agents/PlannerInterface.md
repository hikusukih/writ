# *Planner* Interface

"*Planner*" is an (informal?) interface — any agent whose role is to interpret requirements and produce a plan or delegation decision implements the *Planner* interface. The [Orchestrator](Orchestrator.md) is the widest-scope planner. More specialized planners should include "*Planner*" in their name (e.g., `Social-Communication-Planner-Agent.md`, `General-Planner-Agent.md`). This is a naming convention, not a strict enforcement like a Java interface.

## Function Structure (Shared)

> See [Overview: What "Agent" Means Here](../Overview.md#what-agent-means-here) for the general pattern.

All planner functions follow the same shape: receive a task or work assignment as invocation context, make an LLM call to produce a plan, validate the output, write a human-readable PLAN file for auditability, return the structured result. The LLM decides *what to do*; the function handles assembly, validation, and file I/O.

**XYZ-AGENT.md should contain** (for any planner): How to decompose work, what level of granularity to target, risk assessment approach, how to reference available scripts. Mutable — [*BIG_BROTHER*](../../../dictionary.md) can update these as planning patterns improve.

**Caller provides**: The task or work assignment to plan for. Upper planners receive interpreted user intent from the Orchestrator. Lower planners receive partitioned work from the General *Planner*. The script index is infrastructure — planner functions read it directly rather than receiving it from the caller. A caller only passes scripts as invocation context when it has curated a relevant subset.

## Shared *Planner* Qualities

All *Planner* share:
- Interpreting inputs (requirements, context) and producing either a PLANXYZ.MD or delegation decisions
- Choosing among existing skills/scripts, requesting [Adjutant](Adjutant.md) to download from a trusted repo, or commissioning new scripts to be written
- Risk profile assessment, in collaboration with [*Soul*](../../../dictionary.md) rather than a bolted-on variant approach
- **Junior-level task granularity**: Plans should decompose work into steps manageable for an apprentice- or junior-level human. This forces granular intermediate goals that can be checked for correctness by a reviewer or a human. If a step can't be explained simply, it needs further decomposition.
- **Context window efficiency**: Plans should include enough context for downstream agents to act, but no more. Avoid passing entire histories when a summary suffices. Conversely, it may be necessary to pull a user quote from last month related to the task at hand.

## PLANXYZ.MD Format

**Granularity by level**:
- **Upper *Planner*** (General *Planner*): Produce partitioned work assignments — goals, requirements, success criteria, and how to split work across Lieutenant *Planner*
- **Lower *Planner*** (Lieutenant): Produce execution specs against those assignments — specific scripts, parameters, ordering
- Gets more granular descending the hierarchy

**Format**: Natural language (English). This is a deliberate trade-off — structured formats might unlock more raw LLM power, but natural language keeps plans human-readable and auditable. Revisit if this becomes limiting.

**Open questions**:
- How detailed at each level?
- Reference format for scripts (ID? name? capability description?) — see [OpenQuestions.md §7](../../planning/OpenQuestions.md#7-planxyzmd-format)

---

## General *Planner* (First Order)

### Qualities

- **Editable by agents during runtime**: General-Planner-Agent.md: Yes
- **Inputs**: User requirements, available tools, history of solved problems, skill.md files
- **Outputs**: PLANXYZ.MD
- **Class-specific reviewer**: General-*Planner*-[*Reviewer*](../../../dictionary.md) ([Review Interface](ReviewInterface.md) implementation)

### Function Structure

**The function** (`createStrategicPlan()`): Receives interpreted task description from Orchestrator. Reads the script index directly. Builds system prompt from identity docs + General-*Planner*-Agent.md. Constructs user message with task, script index, and output format instructions. Calls LLM. Extracts and validates JSON against the StrategicPlan schema (Zod). Writes PLAN-{id}.md to disk for auditability. Returns a structured StrategicPlan with WorkAssignments. Accepts an optional curated script subset from the caller — if not provided, reads the full index. *`createStrategicPlan()` replaced the original `createPlan()` in Tier 2. The legacy function remains in the codebase but is no longer called from `handleRequest()`. See [OpenQuestions.md §"Legacy createPlan() Cleanup"](../../planning/OpenQuestions.md#legacy-createplan-cleanup) for removal timeline.*

**General-*Planner*-Agent.md should contain**: How to assess task complexity, how to partition work for Lieutenant parallelism, what makes a good plan vs. an over-specified or under-specified one, patterns to follow when mapping user intent to script capabilities.

**Caller provides** (Orchestrator): Interpreted task description (not raw user input — the Orchestrator has already filtered/clarified). Optionally, a curated subset of scripts if the Orchestrator has determined only certain scripts are relevant.

### Purpose

General *Planner* is mutable (unlike Orchestrator), owns plan authorship, and produces a structured plan that identifies what needs doing and how to partition work across Lieutenant *Planner*. Its output enables Lieutenant parallelism — one General *Planner* output can be split across multiple Lieutenants working concurrently.

### Responsibilities

- Determine what needs to be done
- Write PLANXYZ.MD with knowledge of available tools, and maybe of a history of previously solved problems, or skill.md files
- Calls for new scripts to be written as needed if nothing meets the need

### Fast-Path

~~General *Planner* may route well-defined requests directly to Executor, bypassing Lieutenant.~~ Fast-path bypass was removed in Tier 2. All requests route through GP → LP → Executor. Fast-path is tracked as a potential future optimization — see [OpenQuestions.md §5](../../planning/OpenQuestions.md#5-compiler--execution-boundary).

---

## Lieutenant *Planner* (Second Order)

### Qualities

- **Editable by agents during runtime**: Lieutenant-*Planner*-Agent.md: Yes
- **Inputs**: Partitioned work assignment from General *Planner*'s PLANXYZ.MD
- **Outputs**: Execution specs — calls to executor or developer/writer
- **Class-specific reviewer**: Lieutenant-*Planner*-*Reviewer* ([Review Interface](ReviewInterface.md) implementation)

### Function Structure

**The function**: Receives a partitioned work assignment (one slice of the General *Planner*'s output). Builds system prompt from identity docs + Lieutenant-*Planner*-Agent.md. Calls LLM to validate feasibility against the script index and produce an execution spec. If scripts are missing, commissions Developer/Writer. Returns execution spec for the Executor.

**Lieutenant-*Planner*-Agent.md should contain**: How to assess execution feasibility, when to commission new scripts vs. adapt existing ones, how to translate high-level work assignments into concrete script sequences.

**Caller provides** (General *Planner*, via mediated invocation): One partitioned work assignment from PLANXYZ.MD. The Lieutenant reads the script index directly. The General *Planner* may optionally pass a curated subset of scripts it considers relevant to the assignment.

### Responsibilities

- Confirms the assigned work can be implemented by existing scripts
- Calls the [Developer/Writer](DeveloperWriter.md) to write missing ones
- Exists as a separate agent for context size reasons
