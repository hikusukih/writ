# Backlog

Items here are potentially valuable but not yet committed to the roadmap. Promote to Roadmap (with a phase) or OpenQuestions.md (with design questions) when ready to act on.

Each item has a file in this directory. This index lists them in rough priority order.

## Items

1. **User Statement Log** (`backlog-statement-log.md`) — Persistent evidence store linking user statements to jobs. Companion to Job Graph.
2. **Initiative Table & Persistence** (`backlog-initiative-table.md`) — Persistent initiative entries with cron expressions. Companion to Job Graph.
3. **Throbber / Acknowledgment UX** (`backlog-throbber-ux.md`) — Per-channel activity indicators and async acknowledgment patterns.
4. **Containerization** (`backlog-containerization.md`) — AgentOS as a self-contained deployable container. Prerequisite for Gitea and dashboard.
5. **Gitea Integration** (`backlog-gitea.md`) — Embedded Gitea for script repo hosting and human inspection.
6. **Script Branch Workflow + Code-Reviewing-Agent** (`backlog-branch-workflow.md`) — Scripts developed on branches, merged via reviewed PR.
7. **Web Dashboard** (`backlog-dashboard.md`) — Browser UI for system visibility, job status, review history, FAFC resolution.
8. **ClawdBot Integration & Untrusted Execution** (`backlog-clawdbot.md`) — Sandbox model for imported skills/agents outside Writ's review chain.
9. **BIG_BROTHER Proactive Config Optimization** (`backlog-bb-optimization.md`) — Proactive mode for BB: analyzes execution logs and proposes config improvements on a per-invocation threshold, not just in response to RR flags.
10. **Developer/Writer Branch-Based Script Staging** (`backlog-dw-branch-staging.md`) — Replace flat staging dir with git branch per DW session. Depends on Gitea integration.
11. **Scenario CI via Claude Code Web** (`backlog-scenario-ci.md`) — Automated behavioral testing using ephemeral Claude Code web sessions as integration test environments. Validates end-to-end pipeline and self-authoring capability.

## Exploration Sketches

These are not backlog items — they're working artifacts from design sessions. Kept for reference.

- `exploration-job-dag.md` — Jobs as first-class entities with dependency graphs (source material for Job Graph & Scheduler spec)
