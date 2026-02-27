# Prompt Evolution

## Purpose

Being a capable OS user in a world that relies on prompts includes prompt engineering. [*Agent*](../../dictionary.md) need to improve not just their scripts but their prompts — the instructions that shape how models approach tasks. This is analogous to A/B testing models, but for the *instructions* given to those models.

Prompt evolution tracks how agent prompts change over time and whether those changes actually improve performance.

## Core Concepts

### Version History with Performance Deltas

Every change to an [*XYZ-AGENT.MD*](../../dictionary.md) or XYZ-REVIEWER.MD is tracked with:

- The diff (what changed)
- Why it changed (the RR flag, human feedback, or [*BIG_BROTHER*](../../dictionary.md) reasoning that triggered it)
- Performance before and after the change
- Which model was in use (so prompt changes aren't conflated with model changes)

This creates a searchable history: "what happened the last time we changed the Developer-[*Reviewer*](../../dictionary.md)'s instructions about scope?"

### Prompt A/B Testing

For non-deterministic tasks where prompt quality directly determines output quality:

- Candidate prompt variants can be tested against each other
- Results are evaluated by reviewers or humans
- Winning variants are adopted; losing variants are logged for reference
- Guards against prompt drift — changes that individually seem fine but collectively degrade performance

### Improvement Queue

Pending prompt modifications awaiting human approval. Changes to core agent behavior ([*OS Class*](../../dictionary.md)-adjacent prompts, constitutional interpretation guidance) require explicit sign-off. Tactical changes (how a content agent structures its output) can be auto-approved after sufficient positive signal.

### Integration with *BIG_BROTHER*

*BIG_BROTHER* already modifies reviewer *XYZ-AGENT.MD* files. Prompt evolution wraps that mechanism with tracking:

- *BIG_BROTHER* proposes a change → change is logged with rationale
- Change takes effect → performance is monitored
- If performance degrades → change is flagged for rollback or further iteration
- If performance improves → change is confirmed and the delta is recorded

## Design Philosophy

Prompt evolution prevents the system from optimizing itself into a local maximum. Periodic human review of prompt changes — especially for mature agents with positive track records — catches subtle drift. The goal is to outsource tactical prompt refinement while keeping humans in the loop on strategic prompt direction.

## Open Questions

- How do we measure prompt quality for subjective tasks?
- What's the rollback mechanism when a prompt change causes regression?
- How does this interact with model changes? (A prompt optimized for one model may be suboptimal for another)
