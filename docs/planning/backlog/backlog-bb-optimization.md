# BIG_BROTHER Proactive Config Optimization

## Summary
A proactive mode for BIG_BROTHER that analyzes accumulated execution logs and proposes agent config improvements based on observed patterns — not just in response to RR flags.

## Motivation
The reactive path (RR flag → BB fix) addresses individual violations. A proactive path would detect systemic patterns: agents that consistently produce suboptimal plans, reviewers whose approval patterns drift over time, or execution patterns that suggest a config update would improve quality. This is most valuable for judgment-exercising agents (planners, reviewers) where failure modes emerge gradually in logs.

## Design Notes
- Trigger: execution count threshold per agent (e.g., every 50 invocations), not time-based.
- Same review + HJA gate as reactive path — BB proposes, BB-Reviewer reviews, human confirms.
- Distinct from reactive: reactive fixes a specific violation; proactive optimizes for observed patterns.
- "AgentOS updates its member-agents' configs" — the agent does not update itself. BIG_BROTHER (as system-level tooling) is the sole modifier.

## Open Questions
- What threshold per agent type? Fixed or adaptive?
- What log data does BB analyze? Review decisions, execution outcomes, planner accuracy?
- How to measure "improvement" for subjective tasks?

## Dependencies
BIG_BROTHER (Tier 3), Review decision logging (Tier 3).

## Unlocks
Continuous improvement without requiring flag triggers. Gradual config refinement.
