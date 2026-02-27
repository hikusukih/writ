# DomestiClaw Architecture Overview

> **This document (and the entire set in docs/architecture) describes the intended design — not current implementation state.** For what is built vs. what is planned, see `docs/planning/Roadmap.md`.

## Context

OpenClaw is full of security holes as implemented. But it's a cool idea as a local deployed, self-improving agent setup. Can call out to commercial APIs or locally hosted models.

The goal is to mutate the architecture and find something less insecure. The analogy: the agent as a self-expanding OS.

## Core Philosophy

Linux as a concept is like... a set of filesystems, each serving a different purpose, each maintained by a set of authors. When some user instantiates it, they take the basic set of files and customize it the way they want it. It's just a big list of files, with different permissions. The user can choose which files to modify, which to add, in order to give the system different capabilities.

Similarly, DomestiClaw should be a set of files, executables, best practices. Different versions will be maintained for different purposes by different authors. The difference is that it can modify (certain parts of) itself, and act as an author.

It should be a capable user of an OS - it should seek updates at intervals, or use the tools provided by the system (cron jobs to start package manager updates) to do so. It should download software, having considered whether the software is fit for the purpose, and secure enough for the purpose such that side effects are not undesirable.

It can be misled, just like a user. Best practices will emerge.

**LLMs provide judgment; functions provide execution.**

LLM-backed agents decide what to do — they interpret intent, author plans, evaluate compliance, flag violations. Deterministic code does everything else. LLM output never directly triggers side effects; it always passes through a reviewer and a deterministic translation step (the [*Compiler*](../../dictionary.md)) before anything runs.

This separation serves two purposes:

1. **Blast radius containment**: A compromised or manipulated model can produce bad text. It cannot directly cause bad actions. Every path from LLM output to execution passes through a reviewer and the *Compiler*.

2. **Specialized judgment**: LLM agents are scoped to decisions appropriate to their role. Each sees only the context it needs. Reviewers are specialized to their subject agent's function. No single model has the full picture, which limits the value of any single injection attack.

Injection risk is treated as a constant assumption, not an edge case. Mitigations are structural: scoped context, intercepted output, deterministic execution, and explicit exclusion of task input from self-improvement loops (e.g. [*BIG_BROTHER*](../../dictionary.md) never sees the task that triggered a review).

**Model selection follows the judgment/execution split.**

The closer a call is to pure execution — structured input, structured output, limited ambiguity — the more replaceable the model. Calls requiring genuine judgment require capable models.

First-round calibration:

| Task | Ambiguity | Error consequence | Model tier |
|---|---|---|---|
| Orchestrator — intent interpretation | High | Medium (caught downstream) | Capable |
| [*Constitution*](../../dictionary.md) reviewer | Medium | High (last line of defense) | Capable |
| General [*Planner*](../../dictionary.md) — complex request | Medium | Medium | Capable |
| *BIG_BROTHER* — config rewrite | Low | High (delayed, systemic) | Capable — do not downgrade |
| General *Planner* — simple request | Low | Low | Lighter viable |
| Executor — plan to instruction JSON | Low | Low (*Compiler* + reviewer catch it) | Lighter viable |
| *Compiler* | None | — | Not LLM |

Use a capable model everywhere for initial deployment. Downgrade specific calls only after reviewer logs and RR samples give you confidence a lighter model isn't degrading silently. *BIG_BROTHER* should stay on a capable model indefinitely — its errors are delayed and systemic.

As local model quality improves, Executor and simple General *Planner* calls are the first candidates to migrate off API. Reducing external API dependency is an explicit long-term goal, not just a cost optimization — it reduces attack surface.

Model Management module will formalize routing and tracking. This heuristic is the design intent it should implement.

## What "[*Agent*](../../dictionary.md)" Means Here

An *Agent* is a **function** — deterministic code that wraps a judgement call. The function assembles context, makes the call, validates the output, and returns a structured result. The judgement is usally provided by an LLM, sometimes by the user; the function provides everything else.

The LLM call inside the function is shaped by three layers of context, each owned by a different concern:

1. **Identity context** (SOUL.md, CONSTITUTION.md) — system-wide, shared across all agents. Defines personality and values. Changes rarely and only through mediated edits.

2. **Agent context** (XYZ-AGENT.md) — role-specific behavioral instructions for the LLM. Describes what this particular agent should prioritize, how it should reason, what patterns to follow or avoid. Mutable over time (by *BIG_BROTHER*, through review). This is the agent's "learned behavior."

3. **Invocation context** — what the caller passes in for this specific call. Task-specific and ephemeral. The caller decides what the LLM needs to know to do its job *this time*, and how to frame the request.

On the output side, the function:
4. Parses the LLM response (extract JSON, structured fields)
5. Validates it (Zod schema)
6. Passes it through review (reviewer intercepts before it reaches the caller)
7. Returns the structured result

The deterministic code is the function. The XYZ-AGENT.md is what we tell the LLM about its role. The caller's prompt is what we tell the LLM about this particular task.

### Worked Example: General *Planner*

The General *Planner* sits in the middle of the chain — called by Orchestrator, its output consumed by Executor. This makes it a good example of both sides.

**Being called (Orchestrator → General *Planner*):**

The Orchestrator function makes its own LLM call first, interpreting the user's raw request into a clean task description. Then it calls `createStrategicPlan()` — the General *Planner* function — passing:
- The interpreted task description (invocation context — what to plan for)
- The identity context (SOUL.md, CONSTITUTION.md, agent configs)

The Orchestrator does *not* pass the script index. The script index is infrastructure — the planner function reads it directly, just as any function can read a file it needs. The only time scripts should appear in invocation context is when a caller has applied judgment to curate a relevant subset.

**Inside the function (`createStrategicPlan()`):**

The function reads the script index directly, then assembles the LLM call:
- **System prompt** = SOUL.md + CONSTITUTION.md + General-*Planner*-Agent.md (layers 1 + 2)
- **User message** = the task description + script index + output format instructions (layer 3)

The LLM produces a response. The function extracts JSON from it, validates it against the StrategicPlan schema (Zod), writes a human-readable PLAN-{id}.md to disk for auditability, and returns the structured StrategicPlan with WorkAssignments.

**Its output being consumed (General *Planner* → Executor):**

The Executor function receives the *Plan* — a validated data structure, not raw LLM text. The Executor maps plan steps to instruction JSON. The Executor function may make an LLM call for ambiguous mappings, shaped by its XYZ-AGENT.md, with the *Plan* as its invocation context.

### What This Means for the Specs

Each agent spec (Orchestrator.md, PlannerInterface.md, Executor.md, etc.) describes:
- What the **function** does — its inputs, outputs, and deterministic behavior
- What the **XYZ-AGENT.md** should contain — the role-specific LLM instructions
- What the **caller provides** — the invocation context contract

The function's code is not editable by agents (at least not until the system proves capable of writing code). The XYZ-AGENT.md is (through *BIG_BROTHER* + review). The invocation context is ephemeral and constructed fresh each call. This three-layer split is why a compromised XYZ-AGENT.md can degrade judgment but can't change what the function *does* with the output — validation, review, and the *Compiler* are all in the deterministic layer.

## Filesystem Layout

The filesystem separates **building DomestiClaw** (project tooling, source code, docs) from **running an instance** (identity, scripts, runtime output). Everything a running instance needs lives under `src/instance/` in source and `dist/instance/` after build.

```
domestiClaw/
│
│ ── INSTANCE INPUTS (what a running DomestiClaw is) ──────────────
│
├── src/
│   ├── instance/              # Assets that ship with an instance
│   │   ├── identity/          #   WHO THE SYSTEM IS
│   │   │   ├── SOUL.md        #     Personality — user-editable via mediation
│   │   │   ├── CONSTITUTION.md #    Core values — ships with system, rarely changes
│   │   │   ├── registry.json  #     Agent registry (roles, classes, permissions)
│   │   │   ├── agents/        #     Per-agent behavioral instructions (XYZ-AGENT.md)
│   │   │   │   ├── *-agent.md         # Agent configs (7 agents)
│   │   │   │   └── *-reviewer-agent.md # Per-agent reviewer configs (6 reviewers)
│   │   │   └── anti-patterns/ #     Per-agent append-only anti-pattern lists
│   │   │       └── anti-patterns-{agentId}.md
│   │   └── scripts/           #   WHAT THE SYSTEM CAN RUN
│   │       ├── list-files.sh  #     Shell scripts with frontmatter for discovery
│   │       ├── read-file.sh   #     (# @name, # @description, # @param)
│   │       ├── write-file.sh  #     Scoped to project root for security
│   │       ├── append-file.sh
│   │       ├── git-status.sh
│   │       └── search-content.sh
│   │
│   │ ── INSTANCE CODE (deterministic wrappers around LLM calls) ──
│   │
│   ├── index.ts               #   CLI REPL entry point
│   ├── types.ts               #   Shared type definitions
│   ├── schemas.ts             #   Zod runtime validation schemas
│   ├── logger.ts              #   Verbose logging utilities
│   ├── sessions.ts            #   Session persistence (load/save)
│   ├── agents/                #   Agent functions
│   │   ├── base.ts            #     Core invokeAgent() function
│   │   ├── claude-client.ts   #     LLMClient interface + createClaudeClient/createLLMClient
│   │   ├── ollama-client.ts   #     createOllamaClient() for local models
│   │   ├── prompt-builder.ts  #     Assembles LLM prompts from identity + context
│   │   ├── orchestrator.ts    #     handleRequest() — top-level delegation
│   │   ├── planner.ts         #     createStrategicPlan() (GP) + legacy createPlan()
│   │   ├── lieutenant-planner.ts #   createDetailedPlan() — script-level plans from assignments
│   │   ├── developer-writer.ts #    generateScript/stageScript/promoteScript — script authoring
│   │   ├── executor.ts        #     executeFromPlan() — maps plans to instructions
│   │   ├── reviewer.ts        #     Rule-based security checks (fast fallback)
│   │   ├── llm-reviewer.ts    #     reviewWithLLM() — LLM-based review with SOUL/CONSTITUTION
│   │   ├── reviewed.ts        #     withReview() HOF + applyReview() helper
│   │   ├── human-judgment-agent.ts # handleFAFC() — FAFC review decisions
│   │   ├── review-log.ts      #     Review decision logging (append-only JSONL)
│   │   ├── reviewer-reviewer.ts #   auditReviewDecision(), sampleAndAudit()
│   │   ├── big-brother.ts     #     proposeConfigUpdate(), triggerBigBrother()
│   │   ├── sampling-rate.ts   #     Per-agent dynamic review sampling rates
│   │   ├── semantic-review.ts #     Pre-execution semantic review gate (stubbed)
│   │   ├── llm-utils.ts       #     extractJson(), callWithValidation()
│   │   └── *.test.ts          #     Tests (colocated with source)
│   ├── compiler/              #   Compiler: validates JSON, composes + runs scripts
│   │   └── compiler.ts        #     compile() — deterministic execution layer
│   ├── scripts/               #   Script discovery and execution engine (TS)
│   │   ├── index.ts           #     Discovers scripts via frontmatter parsing
│   │   └── runner.ts          #     Spawns shell scripts as child processes
│   ├── identity/              #   Identity file management (TS)
│   │   ├── loader.ts          #     Reads SOUL, CONSTITUTION, registry, anti-patterns, configs
│   │   ├── anti-patterns.ts   #     appendAntiPattern() for BIG_BROTHER
│   │   └── writer.ts          #     Atomic config writes with backups
│   ├── io/                    #   I/O abstraction layer
│   │   ├── IOAdapter.ts       #     IOAdapter interface
│   │   └── CLIAdapter.ts      #     CLI implementation (readline + console)
│   └── jobs/                  #   Job graph system (Tier 4, partially built)
│       ├── types.ts           #     Job, JobType, JobStatus, Callback types
│       ├── store.ts           #     Persistent job store (runtime/jobs/)
│       └── scheduler.ts       #     DAG scheduler with dependency resolution
│
│ ── INSTANCE OUTPUT (ephemeral, gitignored) ──────────────────────
│
├── runtime/                   # Created at runtime, safe to delete
│   ├── plans/                 #   PLAN-{id}.md files and instruction JSON
│   ├── logs/                  #   agent.jsonl + review-decisions.jsonl
│   ├── sessions/              #   Persisted conversation history (current.json)
│   ├── jobs/                  #   Persistent job store (JSON per job)
│   ├── config-backups/        #   Atomic config write backups
│   └── staging/scripts/       #   Developer/Writer script staging area
│
│ ── BUILD OUTPUT (gitignored) ────────────────────────────────────
│
├── dist/                      # Self-contained deployable (`npm run build`)
│   ├── *.js                   #   Compiled TypeScript
│   └── instance/              #   Copied from src/instance/
│       ├── identity/          #     (same structure as source)
│       └── scripts/
│
│ ── PROJECT (building DomestiClaw, not used by instances) ────────
│
├── docs/                      # Design documentation (human-facing)
│   ├── architecture/          #   Specs (this file, agent specs, models)
│   │   ├── Overview.md        #     This file
│   │   ├── agents/            #     Per-agent-class specs
│   │   ├── components/        #     Promoted component specs (e.g. io-adapter.md)
│   │   ├── AgentIdentityAndState.md
│   │   ├── AgentInvocationModel.md
│   │   ├── ModelManagement.md
│   │   └── PromptEvolution.md
│   ├── planning/              #   Implementation planning
│   │   ├── Roadmap.md         #     Phase-by-phase task list
│   │   ├── OpenQuestions.md
│   │   ├── tasks/             #     Per-tier task lists
│   │   └── backlog/           #     Speculative/future features not yet on the roadmap
│   └── working/               #   Human↔Claude Code communication artifacts
│       ├── fold-me-in.md      #     Staging area for notes to integrate
│       ├── later-review.md    #     Items to review in next Claude session
│       └── ClaudeScratchpad.md #    Durable scratchpad from Claude Code to Mike
│
├── scripts/                   # Project tooling (dev/CI only)
│   └── export-for-claude.sh   #   Bundle docs for Claude Project import
│
├── export/                    # Output of export-for-claude.sh (gitignored)
│   └── archive/               #   Archived fold-in documents
│
├── .claude/                   # Claude Code configuration
│   ├── commands/              #   Slash commands (/create-prd, /fold-in, etc.)
│   └── settings.local.json
│
└── # Standard: package.json, tsconfig.json, .env, CLAUDE.md
```

**Key distinctions:**
- `src/instance/` = what a DomestiClaw instance *is*: identity (LLM context) + scripts (capabilities). Copied to `dist/` on build.
- `src/` (rest) = deterministic code (what the agents *do*). Compiled to `dist/` on build. Not self-modifiable.
- `dist/` = self-contained deployable. Compiled JS + instance assets. Gitignored.
- `runtime/` = ephemeral instance output. *Plan*, logs. Gitignored. Safe to delete.
- `docs/`, `scripts/`, `.claude/` = project tooling. Not read by running instances.

## Design Intent

An OS-oriented mentality for maintaining a DomestiClaw instance would create a repository of vetted scripts and tools to accomplish tasks. It would include documentation about which software is good for which purposes, and what side effects or security implications exist.

It will certainly fail to do the correct thing in early iterations. But just as the open source community around Linux has settled on good practices, a community built around refining DomestiClaw could come to a workable set of solutions whereby the adjutant could make reasonable decisions about using the set of available scripts and software to effectively complete user requests.

## Design Lineage

DomestiClaw is a security-first redesign of OpenClaw. For the specific design decisions inherited from OpenClaw and the rationale behind them, see [docs/background/OpenClawRationale.md](../background/OpenClawRationale.md).

## Agent Classes Overview

*Agent* classes define interfaces rather than single implementations. In practice, each category will have multiple implementations on a given system with different levels of access and areas of responsibility within their role.

Each class of agent may get a class-specific reviewer to enforce boundaries appropriate to that role.

**All agents are reviewed.** Each agent instance has a dedicated reviewer instance that intercepts and evaluates all inputs and outputs synchronously before they are committed or executed.

**Review is recursive but bounded.** A single [*Reviewer-Reviewer*](../../dictionary.md) (OS class, immutable) audits reviewer decisions by sampling. See [ReviewerReviewer.md](agents/ReviewerReviewer.md) for details.

**Dev bypass (`--no-review`)**: A `--no-review` flag exists for development and debugging. It bypasses all reviewer checks. This is dev-only and should never be used in production or user-facing deployments. The flag is acknowledged here to keep the security-first framing honest — the system can be run without review, but doing so removes the core safety guarantee.

### *Agent* Specs

- **OS Class** (immutable at runtime):
  - [Orchestrator](agents/Orchestrator.md) - Widest-scope planner, unified user-facing voice
  - [Adjutant](agents/Adjutant.md) - System maintenance (pcOS + [*AgentOS*](../../dictionary.md)). Uses shared Job Graph / Initiative infrastructure with `owner_class: "system"`. See [JobGraph.md](JobGraph.md).
  - [*Reviewer-Reviewer*](agents/ReviewerReviewer.md) - Singleton auditor of reviewer decisions

- **Planner Interface**:
  - [Planner Interface, General Planner, Lieutenant Planner](agents/PlannerInterface.md)

- **Action Agents**:
  - [Developer/Writer](agents/DeveloperWriter.md) - Script and tool authoring
  - [Executor](agents/Executor.md) - Script execution orchestration

- **Review System**:
  - [Review Interface](agents/ReviewInterface.md) - Distributed review across all agents
  - [*BIG_BROTHER*](agents/BigBrother.md) - Reviewer improvement agent

### Supporting Specs

- [Agent Identity and State](AgentIdentityAndState.md) - SOUL.MD, CONSTITUTION.MD, [*XYZ-AGENT.MD*](../../dictionary.md), registry, permissions
- [Agent Invocation Model](AgentInvocationModel.md) - How agents call other agents (decided: mediated via executor)
- [Job Graph & Scheduler](JobGraph.md) - Async, dependency-aware job dispatch. Replaces synchronous pipeline in Tier 4.

### Supporting Modules

- [Model Management](ModelManagement.md) - Model router, A/B testing across models, performance tracking per task category. Critical for non-deterministic tasks (content generation, creative work) where model capability *is* the capability. Tracks model drift over time, selects for cheapest competent model per task type.
- [Prompt Evolution](PromptEvolution.md) - Version history of prompt changes with performance deltas, prompt A/B testing, improvement queue. Wraps *BIG_BROTHER*'s existing mechanism with tracking and rollback. Being a capable OS user in a prompt-driven world includes prompt engineering.

## Foundational Principles

- **Context Window Efficiency**: All agents should balance "enough context" with "efficient usage of the context window." *Agent* templates, *XYZ-AGENT.MD* files, and invocation payloads should be designed with this tension in mind. Don't starve an agent of context, but don't drown it either. This applies to every agent at every level. *Agent*s get only their scope; callers reference as much relevant material as possible. Most context material comes from outside the current conversation (prior state, configs, anti-patterns, etc.). Trimming and prioritization strategy when approaching limits is an open question — see [OpenQuestions.md §4](../planning/OpenQuestions.md#4-context-window-management).
- **Append-Only Logs**: Agents may append to logs but never edit or delete log entries. Logs are the system's memory and audit trail. Tamper-resistance is achieved by keeping log storage outside agent write scopes.
- **Junior-Level Task Granularity**: Tasks delegated to agents should be scoped at a level manageable for an apprentice- or junior-level human. This encourages granular intermediate goals that can be checked for correctness by a human or a sufficiently knowledgeable reviewer agent.
- **Agent Thought Transparency**: All LLM agents in the productive chain (Orchestrator, General *Planner*, Executor) include a brief user-facing thought in their response output. Thoughts are logged always and displayed optionally (verbose vs. quiet mode, controlled by Orchestrator). This makes the system's reasoning visible without additional API cost. Reviewers and *BIG_BROTHER* do not include thoughts — their deliberation is not user-facing.
- **Human Input as Source of Truth**: Human-generated input is marked as such and held as authoritative. *Agent*-generated input is marked as such and held in lower regard. *Agent*-generated directives that conflict with human directives are discarded (except in historical audit records, where we remember what happened but don't use it to guide future action). Conflicts in human-generated input are surfaced to the human as a priority.

## Initiatives

An **Initiative** is a user-defined, ongoing set of goals — larger than a single job, potentially long-running. *Initiative*s are the unit of "I want the system to work on *this* over time."

Each *Initiative* has:
- A definition: what the goals are, what success looks like
- An agent (or set of agents) dedicated to furthering it, invoked on a heartbeat or cron schedule
- A history of actions taken with rationales (append-only audit trail)
- Reporting on progress toward goals
- **Stopping conditions**: the *Initiative* agent can determine when goals are met and further work has diminishing returns, and stop itself to avoid wasting cycles

*Initiative* generate **Jobs** — scoped units of work with an identifier, description, and expected outputs. Jobs can be generated by the user or by the *Initiative*'s agent.

*Initiative* agents may include a **subscription component**: gathering information relevant to the initiative's goals via RSS-like async monitoring of external sources to a local cache. New content in the cache can trigger fresh agent runs. For most purposes, periodic (e.g., hourly) kickoffs are more than sufficient — there's very little time pressure.

The *Initiative* model describes the system's support for autonomous, long-running work alongside direct user requests.

### *Initiative* Builder *Agent*

Orchestrator recognizes an ongoing/recurring request pattern and delegates to a dedicated **Initiative Builder *Agent*** — the Orchestrator does not build the initiative itself. The Orchestrator's role is pattern recognition and handoff with a clean problem statement. *Initiative* Builder handles: clarifying questions, USER.MD preference capture scoped to the initiative, architecture selection, Developer/Writer commissioning if needed.

USER.MD updates from initiative definition are **preference captures**, not profile entries. Example: not "user lives in Boston" but "user wants weather from Boston" — scoped, actionable, initiative-relevant.

### Implementation Architecture

*Initiative* Builder selects from a defined set of implementation architectures:

- **Static** — pure script + cron, no runtime LLM. For fully deterministic tasks (e.g. weather email). LLM cost is front-loaded into setup only.
- **Supervised** — script + cron with optional LLM escalation for edge cases or anomalies.
- **Agentic** — heartbeat agent that plans and executes each cycle. For tasks requiring ongoing judgment (e.g. "monitor this project for significant developments").
- **Reactive** — triggered by external events (cache update, webhook, file change) rather than schedule.

Architecture selection above Static should surface to the user for confirmation via the Human-Judgment *Agent* (see §Human-Judgment *Agent* in [OpenQuestions.md](../planning/OpenQuestions.md)) — cost and complexity implications warrant explicit sign-off.

### Initiative [*Reviewer*](../../dictionary.md)

A dedicated reviewer scoped to initiative output. Evaluation criterion is user intent ("is this doing what the user asked") not just constitutional safety. Knows about the initiative's stated goals and success criteria.

### Orchestrator Acknowledgment Pattern

Before confirming an initiative, Orchestrator synthesizes what it understood and how it will fulfill the request — including inferred details — and asks for confirmation. Example: "I'll email you temp and precipitation from weather.com to xyz@abc.com at 7am. That work?"

*Initiative* Builder makes reasonable assumptions and surfaces them in the acknowledgment rather than blocking on every unknown. **Bias toward action**: start working, surface questions as they arise.

### Parallel Execution

Design target: user provides unstructured input (e.g., a voice memo) containing multiple distinct threads. Orchestrator parses into N threads, each becomes a job or initiative, they execute in parallel, results return to Orchestrator for synthesis.

This is an explicit motivation for job tracking infrastructure — Orchestrator must know what it kicked off, what has returned, and what is pending before it can synthesize a response. Bias toward action: start working, surface questions as they arise.

Open questions for the *Initiative* system are tracked in [OpenQuestions.md §Initiatives](../planning/OpenQuestions.md#initiatives).

## Bootstrapping

The system ships with:
- **CONSTITUTION.MD**: Predefined, ships with the system
- **SOUL.MD**: Template that gets personalized during first user interaction via bootstrap dialogue
- **Minimum agent set**: See [OpenQuestions.md §1](../planning/OpenQuestions.md#1-bootstrapping--initialization) for open questions on bootstrap composition
- **Preloaded scripts/skills**: See [OpenQuestions.md §1](../planning/OpenQuestions.md#1-bootstrapping--initialization)

Bootstrap dialogue structure and the specific questions it asks are open design questions tracked in [OpenQuestions.md §1](../planning/OpenQuestions.md#1-bootstrapping--initialization).

## [*Script*](../../dictionary.md) and [*Skill*](../../dictionary.md) Discovery

A **Script** is a bash script, that has been vetted to do what it claims to do. It can be used in a Plan by an Agent.

A **Skill** is a markdown file that describes how an *Agent* can accomplish a task. See [OpenQuestions.md §12](../planning/OpenQuestions.md#12-skillscript-discovery).

The **script index** is infrastructure — any agent function can read it directly. It is not passed as invocation context unless a caller has applied judgment to curate a relevant subset. This keeps the script index out of the invocation contract between agents and avoids redundant data passing.

A script index contains script IDs, descriptions, and metadata.

Two scoping options:
1. **Universal**: Single index for the entire system — any function reads the full index
2. **Scoped** (more likely): A caller curates a relevant subset based on the task and passes it as invocation context. The full index remains available to the function as a fallback.

The heuristic for scope determination, index format, query interface, and how similar scripts are distinguished are open questions tracked in [OpenQuestions.md §12](../planning/OpenQuestions.md#12-skillscript-discovery).

## Resource Limits

A resource management subsystem is needed to prevent runaway costs and resource exhaustion.

Limits to define:
- Concurrent agent limit
- *Agent* chain depth limit
- Rate limits (API calls per time window)
- Storage limits
- Memory/CPU budgets

This subsystem's design is tracked in [OpenQuestions.md §11](../planning/OpenQuestions.md#11-resource-limits).

## Open Questions

- How are "trusted repos" defined and maintained? *Script* verification approach? Supply chain attack prevention?
- What exactly qualifies as "dumb" in PLANXYZ.MD review?
- What's the relationship between Adjutant and Developer/Writer when new capabilities are needed?
- How does user review of scripts work in practice?
- What is the exact mechanism for agent identity attribution in user-facing responses?
- How does the Adjutant's cron-based daemon coordinate with its LLM-backed advisor component?
- ~~How do planners invoke child agents?~~ **Decided**: mediated invocation via executor. *Planner*s include *Agent* invocation steps in PLANXYZ.MD; the executor calls an agent-runner script. (See [Agent Invocation Model](AgentInvocationModel.md)) *Note: The agent-runner concept has been replaced by the Job Graph model (see [JobGraph.md](JobGraph.md)). Current implementation uses direct function calls; Job Graph is the Tier 4 target.*

### State Management & Persistence
- When do *XYZ-AGENT.MD* files get written to disk?
- What happens if the system crashes mid-update?
- Are there transactions? Rollbacks? Recovery model?

### Metrics & Observability
- Logging strategy beyond append-only principle?
- Debug approach for multi-agent chains?
- Reviewer quality metrics?
- Drift detection?

### Version Evolution
- System update mechanism?
- *Constitution* and *XYZ-AGENT.MD* format migration?
- Old/new version coexistence?

### Meta-Tier Process
- Automated vs manual?
- Trigger conditions?
- Input/output specification?
- LLM-based? If so, who reviews it?

## Meta-System

A larger meta-system spins up instances of DomestiClaw, runs them for a while, notes issues, and curates/maintains creation of new instances. This allows experimentation and iteration without requiring all work to be done by human hands. The meta-system informs design decisions around logging and Review Flags — specifically, what gets logged and how flags propagate must be compatible with meta-tier analysis. See [OpenQuestions.md §15](../planning/OpenQuestions.md#15-the-meta-tier-process) for open design questions.
