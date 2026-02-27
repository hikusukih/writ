# [*Agent*](../../dictionary.md) Identity and State

## SOUL.MD

A single shared document that describes the assistant as a whole. Primarily applies to the Orchestrator but is pulled into context for agents that produce external messages and some reviewers.

**Purpose**: Personality and presentation. How the assistant speaks, identifies itself, and interacts with users.

**Editability**: User can ask Orchestrator to edit this at runtime, but edits are mediated — analogous to `sudo` for system identity. When the user requests a [*Soul*](../../dictionary.md) change, it is routed through a review process that diffs the change and reports implications to the user before applying it ("You changed X, which means reviewers will now allow Y — is that what you intended?"). This preserves user agency while ensuring identity changes are not silent.

*Soul* is only edited by an agent after explicit confirmation from the user.

Reviewers evaluate against the *current* SOUL.MD at the time of their decision. They are stateless with respect to prior versions — consistency means "did the reviewer apply the current *Soul* correctly," not "has *Soul* remained stable." Historical *Soul* changes are logged for meta-tier analysis.

**Bootstrapping**: SOUL.MD ships as a template. During first user interaction, a bootstrap dialogue establishes personality and presentation preferences (similar to the OpenClaw approach). The template evolves over time based on use.

**Rationale for editability**: Users won't know what their *Soul* actually implies until they see it in action. Identity is discovered through use, not fully specified upfront. Requiring a new instance for every identity change is too heavy a penalty for what may be cosmetic adjustments. Examples: "You're my assistant — make it clear there's a bot responding whenever you send my email" vs. "You're an extension of myself — sign emails with my name."

## CONSTITUTION.MD

A single shared document that defines core values and constraints for the system.

**Purpose**: Core values and constraints including:
- Honesty
- "Loyalty" to user
- Helpfulness
- Obedience
- Preferring testable and repeatable solutions to one-offs
- Guarding "secrets"
- **Pro-social orientation**: Produce content and take actions that promote constructive discourse, good-faith disagreement, and collaborative interaction amongst and between humans. Encourage communication between people with differing values and views. When creating public-facing content, aim to convince humans to take pro-social actions and engage with one another constructively.
- [Other foundational values]

**Bootstrapping**: CONSTITUTION.MD is predefined and shipped with the system. It evolves over time via the same sudo-like mediation process as *Soul*.

**Editability**: Requires sudo-like mediation like *Soul*

**Authority**: CONSTITUTION.MD is the primary evaluation criterion for all reviewers. Reviewers assess whether agent actions align with constitutional values.

## [*XYZ-AGENT.MD*](../../dictionary.md)

Per-agent configuration files, named by role: e.g., `Code-Developer-Agent.md`, `Executor-Agent.md`, `General-Planner-Agent.md`, `Orchestrator-Agent.md`.

*XYZ-AGENT.MD* is one of three context layers that shape an agent's LLM call (see [Overview: What "Agent" Means Here](Overview.md#what-agent-means-here)):

1. **Identity context** (SOUL.MD, [*Constitution*](../../dictionary.md)) — shared system-wide, changes rarely
2. **Agent context** (XYZ-AGENT.md) — **this file**. Role-specific behavioral instructions for the LLM. Describes what this agent should prioritize, how it should reason, what patterns to follow or avoid. This is where the system's learned behavior lives. Mutable during runtime (subject to review by [*BIG_BROTHER*](../../dictionary.md)).
3. **Invocation context** — what the caller passes in for a specific call. Ephemeral, not stored in identity files.

The function's deterministic code (validation, file I/O, review routing) is not represented in any identity file — it's TypeScript that wraps the LLM call.

## Agent Registry

A registry file or database that lists all agents, their roles, their class, and their permissions — including which files each agent can call for the editing of. This is the authoritative source for agent permission scopes. It's how planners know "who" to delegate to.

**Reviewer registration**: Reviewers are distinct agents with their own configs (XYZ-REVIEWER.md), but they are not registered in the agent registry. Reviewers are instantiated implicitly by the infrastructure as part of the review system — they are not looked up by name or invoked via the executor. This is deliberate: the review system is structural, not discretionary.

**Reviewer config resolution**: Per-agent reviewer configs are found using the naming convention `{agent-id}-reviewer-agent.md` — not via a registry lookup. The Reviewer-Reviewer is a singleton exception with its own hardcoded config path. See [OpenQuestions.md §6](../planning/OpenQuestions.md#6-agent-instantiation-mechanics) for the open question on how the infrastructure implements this lookup.

## Instance State Files

Separate from agent configuration. Includes:
- **Anti-pattern lists** (e.g., `anti-patterns-developer.md`, `anti-patterns-planner.md`): Append-only lists of known problematic patterns. Reviewers read these but do not directly write to them.
- **Logs**: Reference anti-patterns, *Soul*, CONSTITUTION.MD, or *XYZ-AGENT.MD* text to document why agents made particular decisions. Post-hoc reasoning for future analysis.

Access to instance state files is controlled and limited.

## USER.MD

Per-user profile documents that track inferred likes, dislikes, preferences, and interaction patterns.

**Purpose**: Personalization without polluting *Soul* (which defines the system's identity, not the user's preferences). It's a cheat-sheet for delighting the user, not a dossier.

**Editability**: Updated via a heartbeat process — the system periodically asks about the user to fill out USER.MD. Users can also edit their own USER.MD directly.

**Relationship to other identity files**:
- *Soul* defines *how the system behaves*
- *Constitution* defines *what the system values*
- USER.MD defines *what the user prefers*
- *Agent* that produce user-facing output may reference USER.MD for tone, format, and content preferences

**Multi-user**: Each user gets their own USER.MD. *Soul* remains shared — identity changes in a multi-user context are harder (may require consensus).

**Open questions**:
- USER.MD schema
- Heartbeat frequency for profile updates
- Privacy implications — what gets tracked, what doesn't
- How USER.MD interacts with *Soul* when preferences conflict with identity

## *BIG_BROTHER* & BIG_BROTHER_REVIEWER

*BIG_BROTHER* is an **action agent**, not a reviewer. It is triggered by [*Reviewer-Reviewer*](../../dictionary.md) flags and updates *XYZ-AGENT.MD* files to address constitutional inconsistencies. It does not make allow/deny/flag decisions.

**BIG_BROTHER_REVIEWER** reviews *BIG_BROTHER*'s proposed *XYZ-AGENT.MD* edits before they take effect. Standard reviewer decisions apply: Allow / [*FAFC*](../../dictionary.md) / [*Flag-and-Continue*](../../dictionary.md) / Request-Modifications.

**Self-modification loop**: *BIG_BROTHER* can update its own `BIG_BROTHER-Agent.md`, subject to BIG_BROTHER_REVIEWER approval.

1. BIG_BROTHER_REVIEWER flags *BIG_BROTHER*'s output
2. *BIG_BROTHER* updates its own *BIG_BROTHER*-Agent.md
3. BIG_BROTHER_REVIEWER reviews the self-update
4. Only after successful review does the new config take effect
5. *BIG_BROTHER* retries the original edit with the updated config
6. **Hard limit**: 3 rounds maximum
7. **Failure case**: After 3 failed rounds, surface to user — indicates fundamental architectural problem requiring human intervention

**Class**: NOT [*OS Class*](../../dictionary.md). *BIG_BROTHER* is mutable at runtime (its own *XYZ-AGENT.MD* is editable by itself, subject to BIG_BROTHER_REVIEWER approval). OS-class agents are immutable at runtime.

## *Agent* Permission Scopes

*Agent* permission scopes — which agents can read and write which files — are a core architectural concern. In early iterations of the project, users will likely perform "open brain surgery" by editing configuration files directly. The permission system described in this document is what the project is building *toward*: a state where agent access to identity files, configuration, and state is mediated and scoped. Until then, the spec serves as a design target rather than an enforced boundary.

## *Agent* Identity in Responses

The Orchestrator is the coherent voice of the system — the user talks to "the system" and gets unified responses. However, when a response originates from a specialized agent (e.g., the Adjutant reporting on system state, vs. a Developer reporting on a script), the Orchestrator should make provenance visible where it matters. The user should be able to tell when they've ended up talking with an infrastructure agent vs. one meant to pen fiction. The exact mechanism (attribution tags, explicit identification, etc.) is an open design question tracked in [OpenQuestions.md §9](../planning/OpenQuestions.md#9-user-interaction-model). The principle is: coherent voice, transparent provenance.
