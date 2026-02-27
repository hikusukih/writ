# DomestiClaw — Open Design Questions

Decisions made and questions still open, organized by subsystem.
This is a living document. Move items from "Open" to the appropriate Phase in `Roadmap.md` once decided.

---

## 1. Bootstrapping & Initialization

**Decided:**
- CONSTITUTION.MD: shipped with system, predefined
- SOUL.MD: template updated during first user interaction via bootstrap dialogue
- Template evolves over time based on use

**Open:**
- What's the minimal viable agent set that ships?
- What scripts/skills come preloaded?
- Bootstrap dialogue structure — what questions are asked?
- Who authors the initial *Constitution*? (Anthropic? User? Shipped template like [*Soul*](../dictionary.md)?)
- Is *Constitution* editable post-ship, or frozen until a major version? (Editability model is decided — sudo-like mediation — but the practical governance question remains)

---

## 2. Inter-[*Agent*](../dictionary.md) Communication Protocol

**Decided:**
- **Custom JSON message passing** (not MCP) for agent-to-agent communication; MCP reserved for external integrations
- Message envelope: rigid schema (from_agent, to_agent, correlation_id, request_type, payload, status, error)
- Payload schema: hybrid — flexible early in development, formalize per request-type as patterns emerge
- Registry exposes agent existence but NOT permissions; enforcement at Executor-[*Reviewer*](../dictionary.md) level
- Failed permission checks → [*Flag-and-Continue*](../dictionary.md) or [*FAFC*](../dictionary.md) depending on stack depth
- Crash handling: auto-retry, max 2 additional attempts (3 total)
- Orchestrator tracks open "jobs" and makes time estimates
- Two completion-awareness modes: delegate notification vs. Orchestrator polling
- Cron used to queue check-ins at estimated completion times

**Open:**
- *Agent*-Runner script interface: what context does it assemble? How does it construct the target agent's prompt? What gets auto-injected (*Soul*, CONSTITUTION.MD)?
- Return value propagation: synchronously block caller? Write to temp file? Queue-based async (future)?
- Failure modes: target crashes (retry?), times out (how long?), returns malformed response (who validates?), escalation after retries exhausted?
- Concurrency: multiple agents invoking same target simultaneously? Locking for shared resources ([*XYZ-AGENT.MD*](../dictionary.md) edits)? Queue serialization vs. parallel execution?
- Schema evolution: who validates conformance for mature payload schemas? How are they published?
- Input/Output scoping: specification format? Enforcement mechanism? *Reviewer* validation of scope adherence?
- Standardized layer boundary protocol: exact error shapes and timeout behavior at each boundary
- Escalation path after 3 retries (surface to calling agent? to user?)
- Job queue format and notification mechanism
- What happens when a check-in reveals a job failed?
- How are time estimates made (heuristic? LLM estimate? both?)?
- Job queue persistence — what if the Orchestrator crashes mid-job?
- Interactive *Agent* Review: is this a new agent type or a mode of existing agents? How does it differ from standard review?

---

## 3. State Management & Persistence

*(Partially addressed — `src/identity/writer.ts` handles atomic `.pending` → rename writes with backups to `runtime/config-backups/`. Built Phase 3 Tier 3.)*

**Open:**
- When do *XYZ-AGENT.MD* files get written to disk? *(Answered: BIG_BROTHER triggers writes via `writeAgentConfig()`/`writeReviewerConfig()` after review.)*
- What happens if the system crashes mid-update? *(Partially answered: atomic write uses `.pending` temp file — incomplete writes leave a `.pending` file, not a corrupted config.)*
- Are there transactions or rollbacks?
- Recovery model?

---

## 4. Context Window Management

**Decided:**
- *Agent*s get only their scope
- Callers reference as much relevant prior-state material as possible
- Most context comes from outside the current conversation (prior state, configs, anti-patterns)

**Open:**
- Specific context assembly rules per agent class
- Trimming/prioritization strategy when at limits
- Balance weighting: *Soul* + *Constitution* + *XYZ-AGENT.MD* + anti-patterns + current task

---

## 5. [*Compiler*](../dictionary.md) & Execution Boundary

**Decided:**
- *Compiler* is a static, deterministic function (not LLM-backed, not editable by agents)
- Takes reviewed instruction JSON, validates structurally (scriptId exists, params match frontmatter), composes a shell script that calls the trusted scripts in order with specified params, runs it directly, logs what it ran, returns results up the chain
- No deposit-and-wait — the *Compiler* calls through to execution directly
- By the time the *Compiler* sees the instruction JSON, trust has been established twice: Executor-Reviewer approved the instructions, and the referenced scripts are already in the vetted local repo
- Validation is structural (like a real compiler), not judgment-based
- **Script reference format in PLANXYZ.MD**: Plans reference scripts by their frontmatter `@name` value. [*Planner*](../dictionary.md) prompt and output schema use `@name` consistently. (Raised by: architecture review 2026-02-18)
- **Compiler vs. Script Runner implementation boundary**: `src/compiler/compiler.ts` wraps `src/scripts/runner.ts` as an internal dependency — `runner.ts` is kept as a low-level utility called only by the *Compiler*. `src/scripts/instruction.ts` (the Phase 1 execution orchestration layer) was deleted; its role is absorbed by the *Compiler*. Matches the design target. (Resolved: Phase 2.1)
**Compiler failure handling**: Stop on first error. A mid-sequence script failure produces an unknown system state; continuing generates misleading results. The Compiler returns the failure immediately with the step index and captured stdout/stderr/exit code.
- **Failure handling**: *Compiler* handle failures mid-sequence — stop on first error? Continue and collect all results? Configurable per step?

**Open:**
- **Fast-path reviewer coverage**: *(Resolved: fast-path removed. All requests route through GP → LP → Executor as of Tier 2. Fast-path is a future optimization if needed — see backlog.)*

---

## 5b. Executor → Script Runner Interface

**Decided:**
- Output format: JSON (primary), YAML acceptable
- [*Script*](../dictionary.md) run at user permission level; some require root elevation
- Auth for elevation handled before "run it" stage
- *Script* versioning: always use latest; versioning exists for post-analysis only (no pinning during execution)

**Open:**
- Exact JSON schema for executor instruction output
- How script runner handles failures and surfaces them to agents
- Output feedback loop: how script results flow back up the chain
- Pre-execution auth flow for root elevation
- Should we limit sudo capability to just [Adjutant](/docs/architecture/agents/Adjutant.md) (or other small set of agents)?
- **registry.json write permissions**: Both *Planner* and Executor have `canWrite: ["runtime/plans/"]` in the registry with no distinction of what each writes within that directory. Fine for now, but needs clarification when permissions are enforced — which agent writes which files within runtime/plans/? (Raised by: architecture review 2026-02-18)

---

## 6. *Agent* Instantiation Mechanics

**Decided:**
- *Agent* instances are created fresh per invocation by direct function calls (e.g. `invokeAgent()`, `createDetailedPlan()`)
- The calling function assembles context (*Soul*, CONSTITUTION.MD, *XYZ-AGENT.MD*, scoped files) and invokes via LLM API
- *(Note: the original `agent-runner` script concept was subsumed by the Job Graph — see Tier 4. Invocation is currently via direct function calls, not script mediation.)*
- **Reviewer config file resolution**: Per-agent reviewer configs are loaded using the naming convention `{agent-id}-reviewer-agent.md`. The Reviewer-Reviewer is a singleton exception with its own hardcoded config path (not derived from a subject agent ID). This is sufficient for Phase 2.4–2.5 implementation.

**Open:**
- Pooling/reuse optimization (future)?
- Lifecycle model (startup, active, idle, terminated)?
- API cost management strategy?
- **Reviewer instantiation lookup**: The architecture says reviewers are not registered in the agent registry (see AgentIdentityAndState.md §Agent Registry). The naming convention above identifies which *config file* to load, but the infrastructure mechanism that resolves `{agent-id}` at runtime and instantiates the right reviewer function is not yet specified.

---

## 6b. Adjutant Dual Nature

The Adjutant has two described roles that may need to be separate components:

1. **Cron-based maintenance**: Scheduled tasks (log rotation, heartbeat checks, system hygiene) — likely not LLM-backed
2. **LLM-backed advisor**: Proactive suggestions, system health reporting — likely LLM-backed with its own *XYZ-AGENT.MD*

**Open:**
- Are these one agent or two? If one, which part is [*OS Class*](../dictionary.md) (immutable at runtime)?
- If the cron component is *OS Class*, does it have an *XYZ-AGENT.MD* at all?
- How do the two sides coordinate? Does the cron scheduler trigger the LLM advisor?
- What does the Adjutant-*Agent*.md govern — just the LLM side?

---

## 7. PLANXYZ.MD Format

**Decided:**
- Upper *Planner* (General): produce partitioned work assignments; Lower *Planner* (Lieutenant): produce execution specs
- Natural language format (trade-off vs. structured formats accepted for now)
- *Script* referenced by frontmatter `@name` value (see §5)

**Open:**
- Specific structure/sections for work assignments vs. execution specs?
- Granularity expectations at each level?
- Operationalize "dumb" for PLANXYZ.MD review: what makes a plan too coarse or too granular? Examples/categories needed so reviewers can apply the criterion consistently.

---

## 8. Trust & Verification

**Decided:**
- **Script versioning during execution**: Always use the latest version of a script. No version pinning during execution — versioning exists for post-analysis only. Old script versions cannot be explicitly called at runtime. (Raised by: architecture review 2026-02-18; already stated in Executor spec)

**Open:**
- *Script* verification approach? Misleading documentation detection?
- Trusted repos: how defined and maintained? Cryptographic verification?
- Supply chain attack prevention?
- **Anti-pattern list mechanics**: *(Partially answered: BIG_BROTHER appends via `appendAntiPattern()`. Per-agent lists in `src/instance/identity/anti-patterns/`. Triggered by RR flags. Meta-tier tooling remains open.)*
- **Script update review**: Is re-review required when a script is updated? Is the script runner version-aware for audit purposes?
- **User script review**: If a user provides a script directly, what review process applies before it's added to `scripts/`?
- **Permission system transition**: Currently the spec is a design target, not an enforced boundary — users edit files directly. What's the concrete trigger/milestone for switching to enforced mediation?

---

## 9. User Interaction Model

**Decided:**
- Users don't see review decisions unless *FAFC* (Flag and Force Confirmation)
- *FAFC* flow: user confirms override → Interactive *Agent* Review → agent asks for clarification → agent or reviewer makes change

**Open:**
- Command interface: chat? CLI? API? (currently CLI REPL)
- *FAFC* presentation format (how is the flag surfaced to the user?)
- User inspection capabilities (can users inspect plan/review state?)
- **Agent identity in responses**: When a response originates from a specialized agent vs. the Orchestrator, how is provenance made visible? Attribution tags? Explicit identification? (Raised by: AgentIdentityAndState.md)

---

## 10. Metrics & Observability

**Open (entirely unaddressed):**
- Logging strategy beyond append-only JSONL?
- Debug approach for multi-agent chains?
- Reviewer quality metrics?
- Drift detection for agent behavior over time?

---

## 11. Resource Limits

**Decided:**
- A resource-management subsystem will be needed

**Open:**
- Concurrent agent limit?
- Max chain depth?
- Rate limits (API calls/time)?
- Storage limits?
- Memory/CPU budgets?

---

## 12. *Script* and [*Skill*](../dictionary.md) Discovery

**Decided:**
- *Script* index contains IDs, descriptions, and metadata
- Likely scoped (relevant subsets per agent) rather than a single universal index
- Scope determined by heuristic (TBD)

**Open:**
- Heuristic for determining which script subset to surface to which agent?
- Index format and query interface?
- How similar/overlapping scripts are distinguished?
- Tagging/categorization system?
- MAJOR NEW FEATURE: How do these even interact with the buttoned-down system I'm building? Do we allow some OpenClaw style agents to do whatever the hell they want, in order to get their capabilities?

---

## 13. Version Evolution

**Open (entirely unaddressed):**
- System update mechanism?
- *Constitution* format migration across versions?
- *XYZ-AGENT.MD* forward migration?
- Old/new version coexistence?

---

## 14. Multi-User Scenarios

**Decided (initial scope):**
- Single user for now
- **USER.MD per user**: tracks inferred likes, dislikes, preferences; updated via heartbeat
- System periodically asks the user questions to fill out USER.MD
- Hypothetical multi-user: single shared *Soul*, changes require plurality/consensus

**Open:**
- Heartbeat frequency?
- USER.MD schema?
- How USER.MD integrates with *Soul* and *Constitution*?
- Privacy implications of USER.MD?
- Can users edit their own USER.MD directly?
- Multi-user: one USER.MD per user, or shared?
- Multi-user permission scoping?
- Shared script access model?

---

## 15. The Meta-Tier Process

**Open (entirely unaddressed):**
- Automated vs. manual trigger?
- Trigger conditions?
- Input/output specification?
- LLM-based? If so, who reviews it?

---

## 16. System Health Assessment & *Agent* Refresh

**Open:**
- The RR flag loop handles reactive improvement. Is there a mechanism for proactive coherence maintenance — periodic review of agent configs against CONSTITUTION.md and SOUL.md outside of flag triggers?
- Options: Adjutant-scheduled health check, user-initiated refresh, or lightweight health-check agent
- Design TBD

---

## Initiatives

**Decided:**
- Orchestrator recognizes prompts that describe recurring patterns and delegates to [*Initiative*](../dictionary.md) Builder *Agent* (does not build initiative itself)
- *Initiative* Builder selects from Static / Supervised / Agentic / Reactive architecture enum
- Architecture above Static requires user confirmation via Human-Judgment *Agent*
- *Initiative* *Reviewer* evaluates user intent ("is this doing what the user asked"), not just constitutional safety
- Orchestrator synthesizes and confirms its understanding before committing an initiative — bias toward action with surface-as-you-go questions
- Parallel execution target: multi-thread input (e.g. voice memo) → N jobs/initiatives → Orchestrator synthesis

**Open:**
- Stopping condition taxonomy: "done" vs. "diminishing returns" vs. "blocked on external" — different states, different behaviors
- How scheduled heartbeat and reactive (cache/event) triggers interact — shared state or independent?
- Can *Initiative* invoke external LLMs (e.g. Gemini for research tasks)? Review implications differ — output comes from outside the constitutional framework
- *Initiative* definition UX: structured Orch-guided dialogue vs. freeform with inferred structure?
- Voice memo / multi-thread input: parsing model, parallelism mechanics, synthesis timing

**Implementation note**: When implementing the *Initiative* section, review how OpenClaw handles ongoing/recurring tasks and parallel execution — its approach (even where the results were poor) may surface failure modes worth designing around explicitly.

### Initiative Cron: Tick-Based vs. Real Cron

**Decided (partial):** Tier 4 uses tick-based evaluation (checked per orchestrator request). This is a known limitation — initiatives only fire when the system is active.

**Open:** When and how to upgrade to real cron (system crontab, internal timer, or persistent background process). Required for unprompted actions (e.g., scheduled emails, morning briefings). Likely depends on IOAdapter supporting outbound push and the system running as a persistent process (containerization).

---

## Review Sampling Rate System

*(Built — Phase 3 Tier 3, `src/agents/sampling-rate.ts`, completed 2026-02-25)*

**Decided:**
- Review is not applied uniformly; sampling rate per agent is dynamic
- **Metric**: invocations since last flag (not time-based)
- **Direction**: positive (clean) invocations reduce rate toward a floor; any flag (reviewer or RR) resets rate to high
- **Context reset**: any change to an agent's context (XYZ-AGENT.md edits, CONSTITUTION.md changes, relevant new scripts added) resets rate to high
- **Floor differential**: OS-class agents have a higher minimum sampling rate than mutable agents; their blast radius justifies permanent higher scrutiny
- **Flag consequence**: flag → immediate rate reset → *BIG_BROTHER* run → rate recovers after N clean invocations

**Open:**
- What is the floor sampling rate for OS-class vs. mutable agents?
- What value of N for recovery after a flag?
- How is sampling rate stored and queried per-agent? Persisted to disk or in-memory?
- What counts as a "context change" for reset purposes — any edit, or edits that affect behavior-critical sections?

---

## Human-Judgment *Agent*

*(Built — Phase 3 Tier 1, `src/agents/human-judgment-agent.ts`, completed 2026-02-24)*

**Decided:**
- A **Human-Judgment *Agent*** is an agent in the standard three-layer sense, except layer 2 (the judgment call) is a blocking confirmation prompt to the user rather than an LLM call
- The function still assembles context, presents a faithful summary of what's being requested and why, waits for explicit y/n, and routes the result through normal infrastructure
- **Sudo-gated**: mode changes (e.g. sampling rate floor changes), OS-class config edits, and other elevated-permission actions require explicit user confirmation via this agent
- **FAFC is the trigger**: [*FAFC*](../dictionary.md) reviewer decisions route through HJA — it is the defined mechanism for all human-in-the-loop moments, not ad-hoc surfacing logic per reviewer
- **Immutable summary generation**: the confirmation summary must be generated by an OS-class agent (Orchestrator), not by the requesting agent — prevents a compromised planner from crafting a misleading confirmation prompt
- **No LLM in the trust chain**: the only agent in the system whose output cannot be manipulated by a compromised model; this is the security guarantee that makes it appropriate as the privilege escalation gate
- **Standard I/O**: receives the proposed action + requesting agent identity + rationale; outputs allow/deny + audit log entry

**Open:**
- A compromised planner could pass a misleading task description to Orchestrator, which faithfully presents it to the user via HJA. The Executor-*Reviewer* is supposed to catch semantic gaps between stated intent and instruction JSON — but this is hard to guarantee pre-calibration. Consider whether pre-execution semantic review (see §Pre-Execution Semantic Review) closes this gap sufficiently.

---

## Reviewer-Reviewer: Batch Review Mode

**Open:**
- Should RR review the last N decisions as a batch rather than sampling one at a time? Batch review gives pattern-level visibility — detecting trends (e.g., gradual permission creep) that individual samples miss. Trade-off: higher per-invocation cost (more tokens), but potentially better signal. Could be a mode: single-sample for routine checks, batch for periodic deeper audits.
- If batch: what's N? Fixed? Adaptive (more decisions since last batch)?

---

## Pre-Execution Semantic Review

*(Built as stubbed gate — Phase 3 Tier 3, `src/agents/semantic-review.ts`, completed 2026-02-25. Gate trigger conditions still open.)*

**Decided:**
- The *Compiler* performs structural validation only ("does this JSON reference valid scripts with matching params"). It does not ask whether the composed shell script does what the plan said it would do.
- A lightweight LLM review pass at the composed-script level — **after** Compiler validation, **before** execution — closes the gap between stated intent and actual side effects.
- This is the last point where a semantic mismatch is visible before real actions happen.
- Distinct from Executor-*Reviewer* (which reviews instruction JSON) and *Compiler* validation (structural only). Reviews the composed shell script against the original plan intent.

**Open:**
- Gate condition for triggering this pass. Options:
  - Static whitelist/blacklist of high-risk agents
  - Dynamic gate tied to current sampling rate (agents at high rate get extra pass, agents at floor do not)
  - Trigger only on fast-path execution (no Lieutenant review) or when Executor-*Reviewer* flagged anything
- Design after Phase 2 reviewers are running and real flag patterns are visible.

---

## Design Target / Forward-Looking Diagram

With the old "Core Loop (Design Target)" removed from CLAUDE.md, should a replacement
forward-looking target be added? Candidates: async job graph model (Tier 4 target state),
IOAdapter multi-channel routing. Or is the architecture Overview.md mermaid diagram sufficient?

---

## Adjutant Status vs. GP/LP Split

**Decided (2026-02-26):**

1. Adjutant scope is unchanged from Overview.md — cron-based system maintenance agent.
2. GP/LP split does not overlap; GP/LP handles user-request planning, Adjutant handles system-defined maintenance.
3. Adjutant uses the shared Job Graph / Initiative infrastructure (same store, same Scheduler, same cron mechanism). See [JobGraph.md](../architecture/JobGraph.md) for details.
4. Jobs and Initiatives get an `owner_class` field: `"user"` | `"system"`.
5. Orchestrator filters user-space by default; system-space is queryable but not surfaced unprompted. Adjutant reports by exception (silence = healthy).
6. Adjutant is a system-class Initiative creator — ships with predefined maintenance initiatives (CVE scans, dependency updates, security audits).
7. System-class initiatives are modifiable via sudo-like mediation (same pattern as Soul edits).

---

## Legacy createPlan() Cleanup

`planner.ts` still exports the legacy `createPlan()` alongside `createStrategicPlan()`.
Should `createPlan()` be removed once the GP/LP pipeline is confirmed stable? This is a
code change, not a doc change — track here until ready to act.

---

## Multi-Provider Support (Near-Term: Gemini for Planning)

Goal: use Gemini 3.1 (or similar cost-effective models) for planning tasks where
reasoning quality is sufficient but cost is lower than Anthropic API.

This is a practical precursor to the full Model Management system (Roadmap item 21).
Near-term questions:
- What's the integration surface? A second LLMClient implementation alongside the
  Anthropic/Ollama clients?
- Which agent calls are candidates for Gemini? GP and LP are the primary targets.
- How do we validate that Gemini output passes the same Zod schemas? (It should —
  the schemas are the contract, not the provider.)
- Does this need A/B infrastructure, or is manual switching sufficient for now?

---

## Usage / Cost Tracking

Need visibility into per-request and per-agent API costs. Questions:
- Is this a standalone utility (log token counts per LLM call, sum by agent/session),
  or part of Model Management?
- Where does the data live? Append to agent.jsonl? Separate usage.jsonl?
- What granularity? Per-call, per-request, per-session, daily rollup?
- Display surface: CLI summary command? Dashboard widget (Tier 6)?

This may already be partially addressed by the existing agent.jsonl logging — check
whether token counts are captured there before building something new.

---

## Meta: Document Organization

**Raised**: `Roadmap.md` describes *how* the system works as much as *when* features are delivered. Consider splitting into `Roadmap.md` (timeline/phases only) + a separate `Architecture-Specification.md` or `System-Design.md` for the structural design content.

**Open**: Is this worth doing now, or after more of the design is settled?

---

## Job Graph & Scheduler

See [JobGraph.md](../architecture/JobGraph.md) for the full architecture spec.

**Open:**
- **Job store format (JSON vs SQLite)**: JSON files to start; revisit if query performance becomes an issue during Tier 4 implementation.
- **Scheduler lifecycle (persistent loop vs on-demand)**: Persistent loop within Node process for initial implementation.
- **Partial result delivery**: Wait for full graph completion before synthesizing response; partial delivery is a future UX refinement.
- **Job expiry/cleanup**: Retention policy for completed jobs TBD.

---

## Meta: Terminology

See [docs/dictionary.md](../dictionary.md) for all project-defined terms and their definitions. (*Script*, *Skill*, *Agent*, *Reviewer*, etc. are defined there.)
