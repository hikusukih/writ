# ClawdBot Integration & Untrusted Execution

## Summary
A potential sandbox model for imported ClawdBot skills and agents that lack Writ-native review guarantees. Also covers a vetting pipeline to transform imported skills into proper Writ scripts or agents.

## Motivation
ClawdBot and similar systems may offer useful capabilities that would be expensive to replicate. The question is whether Writ can host agents or skills from outside its own review chain — and if so, under what containment model.

## Design Notes

### Untrusted Execution Sandbox
- **Containment boundary**: What can a sandboxed agent touch? (filesystem scope, network access, env vars)
- **Review model**: Does sandbox output get reviewed before it affects the rest of the system, or is it fire-and-forget?
- **Blast radius**: If a sandboxed agent is compromised, what's the worst it can do?
- **User consent**: Explicit opt-in per sandboxed agent? Per invocation?

### Skill-to-Agent Vetting Pipeline
- **Vetting process**: Human review? Developer-Reviewer? Both?
- **Transformation form**: Is a *Skill* repackaged as a script with frontmatter, or does it become a full agent with XYZ-AGENT.md?
- **Provenance tracking**: How does the system record that a script originated from ClawdBot skill X, vetted on date Y?

## Open Questions
All of the above. No implementation action is planned — this is exploratory.

## Dependencies
None defined yet.

## Unlocks
Access to external capability ecosystems without building everything from scratch.
