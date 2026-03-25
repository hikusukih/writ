# IOAdapter — Messaging Interface

## Summary
A defined interface between the Orchestrator and all input/output channels. The Orchestrator communicates exclusively through this interface — it does not know or care which adapter is active. The CLI is the first implementation; future implementations add channels without changing the Orchestrator.

## Motivation
The current system is tightly coupled to the CLI. As background jobs, Initiatives, and new interaction surfaces (dashboard, webhooks) are added, the Orchestrator needs a stable contract for sending and receiving messages rather than accumulating per-channel logic. Defining the interface early prevents that coupling from calcifying.

## Design Notes
**Outbound** (Orchestrator → user/channel): job status updates, results, system notifications, FAFC prompts.

**Inbound** (channel → Orchestrator): user requests, external triggers (webhooks, scheduled events, cron), FAFC responses.

**FAFC routing**: The Orchestrator tracks all active conversation avenues and sends FAFC prompts to all of them. It does not delegate this awareness to individual adapters unless requested.

**First implementation — CLI adapter**: The existing REPL becomes a CLI implementation of this interface. A child thread polls the job state store at an interval and surfaces completed job results as they arrive. Main thread handles user input as today.

**Future implementations**: local HTTP endpoint, webhook receiver, desktop notification, web dashboard ([#7](https://github.com/hikusukih/writ/issues/7)). Each is an independent adapter — adding one doesn't affect others.

**Cron/scheduled triggers** fit as an inbound adapter type — a scheduler fires an inbound message on a schedule. Initiatives use this path.

**Design constraint**: The async job queue calls this interface to deliver results. That is the extent of the coupling. The job queue does not know what adapter is active; the adapter does not know how jobs are structured internally.

## Open Questions
- Exact interface definition: method signatures, event shapes
- How does the Orchestrator register/discover active adapters at runtime?
- Adapter lifecycle: can adapters be added/removed while the system is running? YES they should be able to
- Should FAFC time out if no adapter responds within N minutes? What's the job's state while waiting?

## Dependencies
None — this is the foundation other items build on.

## Unlocks
Job Graph & Scheduler, Web Dashboard, Initiative triggers, future messaging channels.
