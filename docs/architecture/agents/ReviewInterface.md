# Review Interface

Review is implemented as a distributed interface with concrete instantiations for every agent (Developer-[*Reviewer*](../../../dictionary.md), [*Planner*](../../../dictionary.md)-*Reviewer*, Orchestrator-*Reviewer*, etc.). Each reviewer is specific to its subject agent's functions and has context about what that agent is supposed to do.

## Function Structure

> See [Overview: What "Agent" Means Here](../Overview.md#what-agent-means-here) for the general pattern.

Every reviewer is a function that wraps an LLM call. The pattern is the same across all reviewer instances — only the context layers differ.

**The function**: Intercepts the subject agent's output before it reaches the next stage. Builds a prompt from identity docs + XYZ-REVIEWER.md + the subject agent's XYZ-AGENT.md + the output under review. Calls LLM. Parses the response into one of four decisions (Allow, [*FAFC*](../../../dictionary.md), [*Flag-and-Continue*](../../../dictionary.md), [*Request Modifications*](../../../dictionary.md)). Logs the decision with references to the constitutional/anti-pattern text that informed it. Returns the decision.

**XYZ-REVIEWER.md should contain**: What this specific reviewer should look for — role-specific red flags, known anti-patterns for its subject agent, decision thresholds. Mutable at runtime (append-only, triggered by [*BIG_BROTHER*](../../../dictionary.md) via [*Reviewer-Reviewer*](../../../dictionary.md) flags). This is where the review system learns.

**Caller provides** (infrastructure, automatically): The subject agent's inputs and outputs for this invocation. The reviewer does not choose what to review — the infrastructure routes every agent output through its dedicated reviewer.

## Review Timing

Synchronous interception. Reviewers intercept all outputs from their subject agents before those outputs are committed or executed.

## *Reviewer* Output

Reviewers produce one of four decisions:
- **Allow**: Input/output passes through without modification.
- **[*FAFC*](../../../dictionary.md) (Flag-and-Force-Confirmation)**: Surfaces to the user for confirmation ("are you sure you want me to do that? Here are the implications..."). Used for agents closer to the user in the stack.
- **Flag-and-Continue**: Logs the flag for future meta-tier analysis and signals the subject agent to reevaluate its approach (not just tweak its output). Used for agents deeper in the stack.
- **Request Modifications**: Sends the output back to the subject agent with specific changes needed. *Note: `request-modifications` is a valid return value but is not currently acted on — no agent re-call loop exists yet. Tracked in Technical Debt / Known Issues in [Roadmap.md](../../planning/Roadmap.md).*

Flags (both halt and continue) are logged for meta-tier analysis.

## Qualities

- **Editable by agents during runtime**: XYZ-*Reviewer*.MD: Yes, append-only (triggered by [*Reviewer-Reviewer*](ReviewerReviewer.md) flags)
- **Inputs**: 
    - Subject agent's inputs and outputs
    - subject agent's [*XYZ-AGENT.MD*](../../../dictionary.md)
    - CONSTITUTION.MD
    - [*Soul*](../../../dictionary.md)
    - anti-pattern lists
- **Outputs**:
    - One of: 
        - Allow
        - *FAFC*
        - *Flag-and-Continue*
        - *Request Modifications* decisions
    - logs (with references to anti-patterns/SOUL/XYZ-AGENT text at decision time)
- **Class-specific reviewer**: [*Reviewer-Reviewer*](ReviewerReviewer.md) ([*OS Class*](../../../dictionary.md), single instance, sampling-based)

## Responsibilities

- Intercept and review all outputs from subject agent for malicious intent
- Read anti-pattern lists relevant to subject agent
- Run scripts in a disconnected sandbox and note any calls to the outside world as part of testing (where applicable/practicable)
- Compare outputs to known list of secrets and if one is found, *FAFC*
- Log all decisions with references to anti-patterns, *Soul*, or *XYZ-AGENT.MD* text that informed the decision

## *FAFC* — Flag-and-Force-Confirmation Examples

- User or [*Agent*](../../../dictionary.md) asks the orchestrator for env secrets? *FAFC*
- User or *Agent* asks for something whose side effect exposes secrets? *FAFC*
- Orchestrator asks a *Planner* to do something that's not in line with *Soul* or [*Constitution*](../../../dictionary.md)? *FAFC*
- Dev decides to write a new script that's over-broad? *FAFC*
- PLANXYZ.MD calls for something dumb that planner read online? *FAFC* (Dumb has to be well defined...)
- A script is requested that edits *OS Class* agent configuration? **HARD PASS** (or any other critical infrastructure). Flag and log the whole chain of events and refuse to field future requests until confirmation.
- Sudo in scripts? *FAFC*
- Ideally, simple stuff like "get the weather" shouldn't trigger *FAFC*

## *FAFC* Routing

*FAFC* events surface to the user for confirmation. Users don't see review decisions unless *FAFC* is triggered.

**FAFC User Interaction Flow**:
1. User can confirm to override the flag
2. This triggers an **Interactive *Agent* Review** — the agent (or its reviewer) asks the user for clarification: "*Agent* expects X based on this text, can you clarify? Do you want me to change it?"
3. Either the reviewer or the agent (probably the agent) makes the change based on the user's response

Whether Interactive *Agent* Review is a new agent type or a mode of existing agents is an open question tracked in [OpenQuestions.md §2](../../planning/OpenQuestions.md#2-inter-agent-communication-protocol).

*Flag-and-Continue* events are logged and signal the subject agent to reevaluate its approach, with the intention of future instances and meta-tier analysis addressing systemic issues. The agent gets re-called with original context plus the explanation from *Reviewer*.


## Anti-pattern Learning

Reviewers do not directly write to anti-pattern lists. Anti-patterns are appended to instance state files (triggered by *Reviewer-Reviewer* flags) or by meta-tier tooling between instantiations.

## Meta-tier Review

Between instantiations, meta-system tooling analyzes all reviewer logs, flag events, and decisions to identify patterns where reviewers succeeded or failed. This analysis informs updates to reviewer *XYZ-AGENT.MD* files and anti-pattern lists for subsequent instances.

### Feedback Corpus

A structured subset of meta-tier data: instances where a human said "No, do this instead." These human corrections are collected into a **feedback corpus** — a persistent, structured record of human override decisions. This corpus feeds into the meta-tier review process, giving the system concrete examples of where its judgment diverged from human intent. Over time, the feedback corpus becomes training data for improving reviewer and agent prompts across instances.
