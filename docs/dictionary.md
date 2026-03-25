# Dictionary

Project-defined terms. When these appear in *italics* in the docs, they carry the meaning defined here. First use of each term in a file links here; subsequent uses are bare italics.

---

## *Agent*
A function — deterministic code that wraps a judgement call. The atomic unit of Getting Things Done in this system. Assembles context, makes the call (prompts the LLM or the user), validates output, returns structured result.
→ [Full definition](architecture/Overview.md#what-agent-means-here)

## *Agent Context*
Layer 2 of the three-layer context model (alongside *Identity Context* and *Invocation Context*) that shapes each agent's LLM call: the *XYZ-AGENT.MD* file. Role-specific behavioral instructions — what this agent should prioritize, how it should reason, what patterns to follow or avoid. Mutable at runtime via BIG_BROTHER + review.
→ [Full definition](architecture/Overview.md#what-agent-means-here)

## *Agent Class: action*
An agent whose primary role is execution of specific tasks — producing artifacts, running scripts, or modifying system state. Examples: Executor, Developer/Writer, BIG_BROTHER.
→ See [Overview.md § Agent Classes Overview](architecture/Overview.md#agent-classes-overview) for class-level documentation.

## *Agent Class: os*
An agent that provides system infrastructure — coordination, oversight, or mediation. OS-class agents are immutable at runtime (their configs cannot be modified by other agents). Examples: Orchestrator, Reviewer-Reviewer.
→ See [Overview.md § Agent Classes Overview](architecture/Overview.md#agent-classes-overview) for class-level documentation.

## *Agent Class: planner*
An agent that produces structured plans consumed by other agents. Planner output is data (JSON plans, work assignments), not direct execution. Examples: General Planner, Lieutenant Planner.
→ See [Overview.md § Agent Classes Overview](architecture/Overview.md#agent-classes-overview) for class-level documentation.

## *AgentOS*
The Writ agent ecosystem: the set of agents, scripts, identity files, and infrastructure that constitute a running instance. Writ is an *AgentOS*. OpenClaw is an insecure one.

## *Anti-pattern List*
An append-only per-agent file (e.g., `anti-patterns-developer.md`) recording known problematic patterns. *Reviewers* read these but do not write directly — appends are triggered by *Reviewer-Reviewer* flags or meta-tier tooling.
→ [Full definition](architecture/AgentIdentityAndState.md#instance-state-files)

## *BIG_BROTHER*
An action *Agent* (not a *Reviewer*, not *OS Class*) triggered by *Reviewer-Reviewer* flags. Updates *XYZ-AGENT.MD* files to address constitutional inconsistencies. Its own config is editable by itself, subject to BIG_BROTHER_REVIEWER approval.
→ [Full definition](architecture/agents/BigBrother.md)

## *Compiler*
A static, deterministic function (not LLM-backed) that validates instruction JSON, composes shell *Scripts* from trusted scripts, runs them, and returns results. The last step before side effects.
→ [Full definition](architecture/agents/Executor.md#compiler)

## *Developer/Writer* (DW)
An action-class *Agent* that authors new shell *Scripts* from capability descriptions. Generates script content with `@name`/`@description`/`@param` frontmatter, stages it in `runtime/staging/scripts/`, passes it through Developer-Reviewer, and promotes approved scripts to `src/instance/scripts/`. Abbreviated *DW* throughout the codebase and docs.
→ Key file: `src/agents/developer-writer.ts`

## *Constitution* (CONSTITUTION.MD)
Core values and constraints for the system. The primary evaluation criterion for all *Reviewers*.
→ [Full definition](architecture/AgentIdentityAndState.md#constitutionmd)

## *FAFC* (Flag-and-Force-Confirmation)
A *Reviewer* decision type: Flag-and-Force-Confirmation. Surfaces the flagged action to the user for explicit confirmation before proceeding. Used for high-risk decisions, exposure of secrets, or elevated-permission actions.
→ [Full definition](architecture/agents/ReviewInterface.md#reviewer-output)

## *Flag-and-Continue*
A *Reviewer* decision type. Logs the flag for meta-tier analysis and signals the subject *Agent* to reevaluate its approach. Used for agents deeper in the stack where surfacing to the user would be disruptive.
→ [Full definition](architecture/agents/ReviewInterface.md#reviewer-output)

## *Human-Judgment Agent* (HJA)
An *Agent* whose Layer 2 judgment call is a blocking confirmation prompt to the user rather than an LLM call. The defined mechanism for all human-in-the-loop moments, including *FAFC* routing and elevated-permission actions.
→ [Full definition](planning/OpenQuestions.md#human-judgment-agent)

## *Identity Context*
Layer 1 of the three-layer context model (alongside *Agent Context* and *Invocation Context*) that shapes each agent's LLM call: SOUL.MD + CONSTITUTION.MD. Nominally shared system-wide, but callers may omit identity files for agents that don't need them (e.g., a Developer/Writer may not receive SOUL.MD). Changes rarely and only through mediated edits.
→ [Full definition](architecture/Overview.md#what-agent-means-here)

## *Initiative*
A user-defined, ongoing set of goals — larger than a single *Job*, potentially long-running. Has a definition, a dedicated agent invoked on a schedule, an append-only action history, and explicit stopping conditions.
→ [Full definition](architecture/Overview.md#initiatives)

## *Invocation Context*
Layer 3 of the three-layer context model (alongside *Identity Context* and *Agent Context*). What the caller passes in for this specific call — task-specific and ephemeral. The caller decides what the LLM needs to know to do its job *this time*, and may include curated subsets of identity files (SOUL.MD, CONSTITUTION.MD) when the agent's role requires them.
→ [Full definition](architecture/Overview.md#what-agent-means-here)

## *Job*
A scoped unit of work with an identifier, description, and expected outputs. Generated by the user or by an *Initiative* agent.

## *OS Class*
A designation for agents that are immutable at runtime — their code and configuration cannot be changed by other agents during a session. Includes the Orchestrator, Adjutant, and Reviewer-Reviewer. Higher minimum review sampling rate reflects their higher blast radius.
→ [Full definition](architecture/Overview.md#agent-classes-overview)

## *Plan* (PLANXYZ.MD)
A structured document produced by a *Planner* specifying what needs to happen, in what order, using which *Scripts*.
→ [Full definition](architecture/agents/PlannerInterface.md#planxyzmd-format)

## *Planner*
Any *Agent* whose role is to interpret requirements and produce a *Plan* or delegation decision.
→ [Full definition](architecture/agents/PlannerInterface.md)

## *Request Modifications*
A *Reviewer* decision type. Sends the output back to the subject *Agent* with specific changes needed before it can proceed.
→ [Full definition](architecture/agents/ReviewInterface.md#reviewer-output)

## *Reviewer*
A dedicated *Agent* that intercepts and evaluates another agent's output before it proceeds. Every *Agent* has one. Not the act of reviewing — the *Agent* that does it.
→ [Full definition](architecture/agents/ReviewInterface.md)

## *Reviewer-Reviewer*
A singleton *OS Class* agent that audits *Reviewer* decisions by sampling. The only agent with oversight over the review system itself.
→ [Full definition](architecture/agents/ReviewerReviewer.md)

## *Script*
A vetted, parameterized shell script with frontmatter (`@name`, `@description`, `@param`). Executable. Goes through Developer/Writer + review pipeline.
→ [Full definition](architecture/Overview.md#script-and-skill-discovery)

## *Script Index*
Infrastructure that discovers and catalogs available *Scripts* by parsing their frontmatter. Any *Agent* function can read it directly.
→ [Full definition](architecture/Overview.md#script-and-skill-discovery)

## *Skill*
A markdown document describing how an *Agent* accomplishes a task. Not directly executable. Design pending.
→ [Full definition](planning/OpenQuestions.md#meta-terminology)

## *Soul* (SOUL.MD)
System personality and presentation. Influences how the assistant speaks, identifies itself, and interacts with users.
→ [Full definition](architecture/AgentIdentityAndState.md#soulmd)

## *XYZ-AGENT.MD*
The naming pattern for per-agent configuration files (e.g., `Orchestrator-Agent.md`, `Planner-Agent.md`). Contains the *Agent Context* for one agent role. Distinct from the agent's deterministic function code, which is TypeScript.
→ [Full definition](architecture/AgentIdentityAndState.md#xyz-agentmd)
