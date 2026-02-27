# Adjutant ([*OS Class*](../../../dictionary.md))

The Adjutant maintains both the PC OS (the host machine's operating system and infrastructure) and the [*AgentOS*](../../../dictionary.md) with timely updates.

**Agent Class**: OS Class (foundational, immutable at runtime)

## Function Structure

> See [Overview: What "Agent" Means Here](../Overview.md#what-agent-means-here) for the general pattern.

The Adjutant is unusual: Most of it is deterministic scripts, and a smaller amount of its functionality requires LLM calls for judgement.

**The cron daemon** (no LLM): Deterministic scheduled tasks — checking for updates, running maintenance, triggering heartbeats. Pure function, no agent context, no invocation context. This is infrastructure, not an agent in the three-layer sense.

**The LLM-backed advisor function**: When the cron daemon encounters a judgment call (e.g., "is this update safe to apply?"), it invokes the advisor function. The advisor builds a prompt from identity docs + Adjutant-[*Agent*](../../../dictionary.md).md + the specific question. Returns a recommendation.

**Adjutant-*Agent*.md should contain**: How to evaluate software for fitness and security, risk tolerance for updates, what constitutes a maintenance priority. Immutable at runtime (*OS Class*).

**Caller provides** (cron daemon): The specific maintenance question or system state requiring judgment. Whether these two components are one agent or two is an [open question](../../planning/OpenQuestions.md#6b-adjutant-dual-nature).

## Implementation

The Adjutant is likely instantiated as a collection of cron jobs for mechanical maintenance tasks (checking for updates, running scheduled maintenance) rather than as a persistent *Agent*. A companion LLM-backed agent may be called upon to report on system state or make judgment calls about software decisions — effectively splitting the Adjutant into a non-LLM daemon and an LLM-backed advisor.

## Qualities

- **Editable by agents during runtime**: No (inherited from *OS Class*)
- **Inputs**: System capability gaps, repository metadata, pcOS and *AgentOS* state
- **Outputs**: Software/script installation decisions, system state reports
- **Class-specific reviewer**: Adjutant-[*Reviewer*](../../../dictionary.md) ([Review Interface](ReviewInterface.md) implementation)

## Responsibilities

- Maintain the pcOS and *AgentOS* with timely updates
- Read repository documentation about available software and scripts
- Seek updates at intervals, or use the tools provided by the system (cron) to do so
- Download software, having considered whether the software is fit for the purpose, and secure enough for the purpose such that side effects are not undesirable
- Create and manage system-class Initiatives (`owner_class: "system"`) for predefined maintenance tasks (CVE scans, dependency updates, security audits)

## Shared Infrastructure

The Adjutant uses the same Job Graph / Initiative infrastructure as user-facing work. Jobs created by the Adjutant carry `owner_class: "system"` and `source: "adjutant:<task>"`. The Orchestrator filters user-space by default; system-space is queryable but not surfaced unprompted. The Adjutant reports by exception — silence means healthy.

System-class initiatives are modifiable via sudo-like mediation (same pattern as Soul edits).

See [JobGraph.md](../JobGraph.md) for the shared scheduler and store details, and [OpenQuestions.md §"Adjutant Status vs. GP/LP Split"](../../planning/OpenQuestions.md#adjutant-status-vs-gplp-split) for the scope decision. The dual-nature question (cron daemon vs. LLM advisor) is tracked in [OpenQuestions.md §6b](../../planning/OpenQuestions.md#6b-adjutant-dual-nature).


