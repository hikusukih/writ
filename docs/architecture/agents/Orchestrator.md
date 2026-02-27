# Orchestrator ([*OS Class*](../../../dictionary.md))

The Orchestrator is the CEO of the system. It interprets user input and responds to the user. It either delegates to more specialized planners or chooses what to tell the executor directly.

**Agent Class**: OS Class (foundational, immutable at runtime)

## Qualities

- **Editable by agents during runtime**: No (inherited from *OS Class*)
- **Inputs**: User requests, agent responses
- **Outputs**: Agent delegation decisions, user-facing responses (coherent voice with transparent provenance)
- **Class-specific reviewer**: Orchestrator-[*Reviewer*](../../../dictionary.md) ([Review Interface](ReviewInterface.md) implementation)

## Function Structure

> See [Overview: What "Agent" Means Here](../Overview.md#what-agent-means-here) for the general pattern.

**The function** (`handleRequest()`): Receives raw user input. Makes an LLM call to interpret intent and produce a clean task description. Delegates to downstream agents (General [*Planner*](../../../dictionary.md) → Executor). Assembles the final response with provenance chain. All delegation, response formatting, and provenance tracking are deterministic code — the LLM call is scoped to `intent interpretation`.

**Orchestrator-[*Agent*](../../../dictionary.md).md should contain**: How to interpret user requests — what "the system's voice" sounds like, when to ask for clarification vs. delegate, how to frame task descriptions for downstream planners. Personality and tone guidance (in coordination with SOUL.md). This file is immutable at runtime (*OS Class*).

**Caller provides**: Raw user input from the REPL or messaging interface. No preprocessing — the Orchestrator is the first agent to see the user's words.

## Responsibilities

- Field requests and determine which agents get called
- Present unified responses to the user, attributing provenance when relevant
- Mediate [*Soul*](../../../dictionary.md) edits (route through review, report implications to user)
- **Prioritize immediate response to user** — delegate work to other agents rather than blocking
- **Track open jobs** — maintain awareness of delegated work and its status

### Ack Before Chain

Orchestrator sends a brief acknowledgment to the user before delegating to the planner chain. The Ack summarizes what the Orchestrator understood from the request and what it's handing to the *Planner* — at the level the user cares about, not implementation detail. This is fire-and-forget; the full response comes later.

### Clarification on Impossibility

If the Orchestrator determines a request cannot be fulfilled (no plausible execution path, missing capability, logical impossibility), it should surface this immediately and ask for clarification rather than passing an unfulfillable task downstream.

### Periodic Safety Reminder

The Orchestrator should occasionally surface agent configuration to the user — quoting a relevant section of an agent's XYZ-AGENT.md or reviewer config in a natural, non-alarming way. Framing: the user is responsible for their own safety and the system is not a black box. Frequency and trigger TBD (time-based, after N interactions, or after significant config changes). Most users will ignore it; the design reflects the principle regardless.

## Job Tracking

The Orchestrator tracks delegated work through two completion awareness modes:

1. **Notification**: Delegate agents notify the Orchestrator on completion
2. **Check-in**: Orchestrator polls delegate state at intervals

The Orchestrator makes time estimates for delegated work and uses cron to queue check-ins at estimated completion times. This allows it to stay responsive to the user while background work proceeds.

**Open questions**:
- What happens when a check-in reveals a job failed?
- How are time estimates made? (Heuristic? Historical data? *Agent* self-report?)
- Job queue persistence — what if the Orchestrator crashes mid-tracking?
    - list of Jobs and [*Initiative*](../../../dictionary.md) should be persistent (file, db, something). User should be able to ask "What are you working on? what's going on?" and get answers about what they system considers unfinished or ongoing business.

## *OS Class* Properties

*OS Class* agents define system boundaries and identity (like what it means to run Arch Linux versus Ubuntu). Their [*XYZ-AGENT.MD*](../../../dictionary.md) files are immutable during runtime.

**Security rationale**: Limits damage from malicious prompts while also limiting system self-modification capability.

**OS Class Members**: Orchestrator, [Adjutant](Adjutant.md), [*Reviewer-Reviewer*](../../../dictionary.md)
