# Web Dashboard

## Summary
A browser-based UI served from within the AgentOS container. Provides human visibility into the running system and a surface for resolving FAFC confirmations, without requiring terminal access.

## Motivation
As the system grows more autonomous, the human needs low-friction ways to inspect what it's doing and intervene when needed. The web dashboard is the primary human-facing window into the running instance — complementing the CLI for users who prefer a browser, and providing capabilities (like FAFC resolution) that the CLI handles awkwardly in an async context.

## Design Notes
**Likely capabilities**:
- Script library browser: what capabilities the system has, with frontmatter documentation
- Job status: current in-flight jobs, recent completions, failures
- Review decision log: what got flagged, why, what was allowed or halted
- FAFC resolution: surface pending confirmations for the user to approve or deny
- Agent config viewer: read-only view of XYZ-AGENT.md files (editing is a separate, higher-trust concern — probably requires explicit mediation like Soul edits)
- Link-out to Gitea for script history and PR review (not duplicated in the dashboard)

**IOAdapter implementation**: The dashboard is an IOAdapter — inbound for FAFC responses and user-initiated actions, outbound for status and notifications. It routes through the Orchestrator like any other channel; it does not bypass the agent chain. it also displays static info.

**FAFC surface**: Pending FAFC confirmations appear in the dashboard as actionable items. The Orchestrator routes FAFC to all active adapters; the dashboard is one of them. The job parks until a response arrives from any active adapter.

## Open Questions
- Tech stack: something lightweight that fits in the container (plain HTML + htmx? a minimal Node server? something else?)
- Authentication: is the dashboard open on the local network, or does it require login?
- Real-time updates: polling vs. websocket for job status and FAFC notifications
- Scope of agent config editing (if any): read-only is safe; write access requires the same mediation as Soul edits
- How does the dashboard handle multiple simultaneous FAFC prompts?

## Dependencies
IOAdapter — Messaging Interface, Containerization

## Unlocks
Human oversight without SSH, FAFC resolution surface, system transparency at a glance.
