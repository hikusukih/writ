# Job Graph & Scheduler

## Summary
A DAG-based job system with dependency tracking, callbacks, and multi-channel response routing. Jobs are the universal unit of work — the scheduler runs them when all dependencies are satisfied, and independent jobs run concurrently. Subsumes the earlier "Async Job Queue" concept.

## Motivation
The current sequential pipeline can't support multiple background jobs running simultaneously. Initiatives require this — a heartbeat agent is a recurring job, and it can't block the user-facing loop. Beyond that, many user requests decompose into independent sub-tasks that should parallelize naturally. A dependency graph (rather than a flat queue) makes that possible without ad-hoc coordination.

## Design Notes

### Jobs as First-Class Entities

Jobs are the universal unit of work. Types include:

- `execute_script` — run an existing *Script* via Executor → Compiler
- `develop_script` — commission Developer/Writer to create a new *Script*
- `plan` — invoke a LieuPlanner to produce an execution spec for a task
- `notify_user` — deliver a message to the user via IOAdapter
- `replan` — return to a GenPlanner or LieuPlanner with new information
- `initiative_setup` — create or modify an Initiative table entry

### Dependency Graph

Jobs declare dependencies via `depends_on: Job.id[]`. The scheduler runs a job only when all its dependencies have completed. Jobs with no unmet dependencies can run concurrently.

**Cycle prevention**: Jobs use monotonically increasing IDs. A job can only depend on jobs with *lower* IDs. "Calling back" to planners or the Orchestrator creates *new* jobs (higher IDs), never circular dependencies.

### Channel Routing

`channel: string[]` — IOAdapter channel(s) to respond on. `["*"]` broadcasts to all active channels. This replaces any need for jobs to know about specific IOAdapter implementations.

### Callbacks

A job's `callbacks` field defines what happens on completion:

- **create_job**: Spawn a new Job (with a new, higher ID — no cycles)
- **notify_orchestrator**: Signal the Orchestrator to synthesize a user-facing response
- **notify_planner**: Signal a GenPlanner or LieuPlanner to replan based on new information
- **update_initiative**: Write progress to an Initiative's audit trail

### Throbber / Acknowledgment Pattern

The Orchestrator sets a configurable timeout per job type. If the job completes within the timeout, the response is synchronous (user sees a brief throbber, then the result). If the job exceeds the timeout, the Orchestrator sends an acknowledgment and follows up asynchronously when the job completes. See `backlog-throbber-ux.md` for UX details.

### Orchestrator as Coordinator vs. Separate Scheduler

Two options, each with tradeoffs:

- **Orchestrator owns scheduling**: Simpler component count. The Orchestrator already manages intent interpretation and result synthesis — adding job dispatch and monitoring keeps coordination centralized. Risk: the Orchestrator becomes too complex.
- **Separate scheduler component**: Cleaner separation of concerns. The Orchestrator dispatches jobs and receives callbacks; the scheduler owns the run queue and dependency resolution. Risk: coordination overhead between two components, more wiring to build.

Decision deferred until implementation.

### Evidence Linking

Jobs reference entries in the User Statement Log (see `backlog-statement-log.md`) via a `StatementRef[]` field. This enables provenance queries ("why are you doing this?") and drift detection for long-running work.

### Persistent Job State Store

Must be persistent — survives restart. The system needs to know what was in-flight if it crashes mid-job. This is not optional for a reliable async model.

### Planner Roles in the Job Model

- **GenPlanner (Strategist)**: Receives interpreted intent from Orchestrator. Decides *how to assign resources* — what kinds of jobs are needed, how to partition work, what can parallelize. Its output is a set of Jobs (or a PLANXYZ.MD that a Job Factory decomposes into Jobs).
- **LieuPlanner (Tactician)**: Receives a single Job of type `plan`. Decides *how to get this specific task done* — which scripts, what parameters, what order. If scripts don't exist, commissions Developer/Writer by creating a `develop_script` Job.

## Open Questions
- **Job Factory**: Who decomposes a GenPlanner's output into Jobs? GenPlanner itself? A separate component? The Orchestrator?
- **Dynamic dependencies**: Can a callback add dependencies to a not-yet-started job, or only create new jobs?
- **Graph persistence**: Is `depends_on` per-job sufficient, or does the graph need first-class representation for visualization / debugging?
- **Review integration**: Per-job `withReview()` wrapping is the assumed model — confirm or revise.
- **Throbber timeout defaults**: What's the right default per job type? Configurable?
- **Orchestrator as scheduler vs. separate scheduler**: See Design Notes above.
- **FAFC in async context**: A background job that triggers FAFC has no guaranteed user present. Options: time out after N minutes? Park indefinitely? Notify all active IOAdapters simultaneously?
- **Concurrency limits**: Max simultaneous jobs? Per-agent limits?
- **Failure handling**: Retry policy per job? Escalation after retries exhausted?
- **Fast-path criteria**: How does the Orchestrator decide "this is simple enough to skip planning and just create an execute_script job directly"?

## Dependencies
IOAdapter — Messaging Interface

## Unlocks
Initiative system, parallel execution, responsive user-facing loop, User Statement Log integration.
