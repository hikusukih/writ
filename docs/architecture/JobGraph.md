# Job Graph & Scheduler

## Purpose

Decouple work initiation from work execution. The current pipeline (Orch → GP → LP → Executor) is synchronous and blocking — the user waits while every step completes sequentially. The Job Graph replaces this with asynchronous, dependency-aware execution: work is decomposed into Jobs, placed in a shared store, and dispatched by a Scheduler as dependencies are satisfied.

This is the foundation for parallel execution, background work (Initiatives, Adjutant maintenance), and multi-channel response routing.

## Core Concepts

### Job

A Job is a **work order** — a discrete unit of work with enough information to be planned and executed independently.

```
Job {
  id:              string          // unique job ID
  graph_id:        string          // groups sibling jobs from the same request/initiative
  owner_class:     "user" | "system"
  source:          string          // what created this job: "user_request", "initiative:<id>", "adjutant:<task>"
  priority:        number          // higher = more urgent. User-interactive > initiative > system maintenance
  state:           JobState
  work_assignment:  WorkAssignment  // the actual work order (from GP's StrategicPlan)
  depends_on:      string[]        // job IDs that must complete before this job is ready
  callbacks:       Callback[]      // what to do on completion (notify_orchestrator, create_job, update_initiative)
  
  // Populated during/after execution
  detailed_plan?:  Plan            // LP's output (written when LP completes)
  execution_result?: ExecutionResult  // Executor/Compiler output
  review_decisions?: ReviewDecision[] // review trail for this job
  error?:          string          // failure reason if state is "failed"
  
  created_at:      datetime
  started_at?:     datetime
  completed_at?:   datetime
}
```

### Job States

```
pending      → Dependencies not yet satisfied. Waiting.
ready        → All dependencies met. Waiting for Scheduler to dispatch.
running      → In-flight. LP and/or Executor actively working.
parked       → Blocked on external input (FAFC, user clarification). Resumes on response.
complete     → Finished successfully. Results populated.
failed       → Finished with error. Error field populated.
needs_replan → LP or Executor determined this assignment can't be completed as specified.
               Triggers Orchestrator re-evaluation.
```

State transitions:
```
pending → ready        (Scheduler evaluates: all depends_on jobs are complete)
ready → running        (Scheduler dispatches)
running → complete     (execution succeeds)
running → failed       (execution errors)
running → parked       (FAFC or external input needed)
running → needs_replan (LP can't fulfill the assignment as specified)
parked → running       (external input received)
needs_replan → [Orchestrator decides: new GP call creates new jobs, or surface to user]
```

### Job Store

A single shared store holding all jobs regardless of origin. Located at `runtime/jobs/`.

- User requests, Initiative heartbeats, and Adjutant maintenance tasks all produce Jobs in the same store.
- Each job is tagged with `owner_class` and `source` for filtering and visibility.
- The Orchestrator filters at the visibility layer: "what are you working on?" queries `owner_class: "user"` by default.
- The store is the Scheduler's single source of truth.

### Graph

Not a separate data structure. The graph is **implicit** in the `depends_on` fields across Jobs sharing a `graph_id`. A job with no `depends_on` entries is a root node. A job whose dependencies are all `complete` is ready to run.

For visualization/debugging, the graph can be reconstructed by querying all jobs with a given `graph_id` and walking `depends_on` edges. No separate graph entity is needed unless debugging experience proves otherwise.

## Components

### `createJobGraph(strategicPlan, metadata): Job[]`

**Deterministic function, not an LLM call.** Takes a StrategicPlan (from GP) and produces Job records.

- One Job per WorkAssignment in the plan.
- Wires `depends_on` edges based on GP's declared dependencies between assignments.
- Sets initial state to `pending` (or `ready` if no dependencies).
- Assigns `graph_id`, `owner_class`, `priority`, `source`, and `callbacks` from the metadata argument.
- Returns the Job array; caller writes them to the store.

### Scheduler

Evaluates the job store on a loop (or event-driven trigger) and dispatches ready jobs.

**Core loop:**
1. Query store for jobs in `pending` state.
2. For each, check if all `depends_on` jobs are `complete`. If yes → transition to `ready`.
3. Query store for jobs in `ready` state, ordered by priority (descending).
4. For each ready job (up to concurrency limit): transition to `running`, dispatch to execution handler.
5. Sleep / wait for next trigger.

**Trigger mechanisms:**
- A new job is added to the store.
- A job completes (may unblock dependents).
- A parked job receives input.
- Periodic tick (fallback, catches any missed events).

**Concurrency limits:** Configurable. Start with a simple global limit (e.g., max 3 concurrent jobs). Per-agent limits are a future refinement if needed. Priority ordering within the ready queue ensures user-interactive work runs before background maintenance.

### Execution Handler

The function invoked by the Scheduler to actually run a job. This is where the current LP → Executor → Compiler chain lives.

For a `plan_and_execute` job:
1. Load identity context, script index (fresh, from disk — not cached on the job).
2. Call LP with the job's WorkAssignment → produces a detailed Plan.
3. Write the Plan back to the job record (`detailed_plan`).
4. Call Executor with the Plan → produces instruction JSON.
5. Call Compiler → runs scripts → produces ExecutionResult.
6. Write results back to the job record (`execution_result`).
7. Run review (per existing `applyReview()` chain).
8. Transition job to terminal state (`complete`, `failed`, or `needs_replan`).
9. Fire callbacks.

**FAFC during execution:** If a reviewer returns FAFC, the job transitions to `parked`. The FAFC prompt is routed to all active IOAdapters. When the user responds, the job transitions back to `running` and resumes from the review step.

**DW integration:** If LP detects missing scripts and triggers Developer/Writer, this happens *within* the job's execution — same as today. DW calls are internal to the LP step, not separate jobs. The job doesn't need to create child jobs for script generation.

## Orchestrator Integration

The Orchestrator's role changes:

**Before (synchronous):** Orch calls GP, loops through assignments calling LP → Executor for each, synthesizes response.

**After (async):** Orch calls GP, calls `createJobGraph()`, writes jobs to store, and returns an acknowledgment to the user (if the work will take time) or waits briefly for fast jobs to complete (throbber pattern).

**On job completion:** The `notify_orchestrator` callback fires. Orch checks: are all jobs in this `graph_id` terminal? If yes → synthesize final response and deliver via IOAdapter. If some jobs are still running → do nothing (or deliver partial results, depending on UX preference).

**On `needs_replan`:** Orch evaluates whether to re-invoke GP (which creates new jobs) or surface the problem to the user. Replan depth is capped at 3 rounds per original request — after that, the user hears about it.

## Callbacks

A job's `callbacks` field defines post-completion actions:

- **`notify_orchestrator`**: Signal the Orch to check graph completion and potentially synthesize a response.
- **`create_job`**: Spawn a new Job (with a new ID — no cycles in the DAG). Used for chained workflows.
- **`update_initiative`**: Write progress to an Initiative's audit trail.
- **`notify_planner`**: Signal GP/LP to replan based on new information (used by `needs_replan` flow).

Callbacks are processed after the job reaches a terminal state. Multiple callbacks per job are allowed.

## Initiative & Adjutant Integration

Initiatives and Adjutant maintenance tasks are **job sources**, not job types. They create jobs in the same store using the same schema:

- **Initiative cron fires** → creates a `plan_and_execute` job with `source: "initiative:<id>"`, `owner_class: "user"`, appropriate priority.
- **Adjutant maintenance fires** → creates a job with `source: "adjutant:<task>"`, `owner_class: "system"`, low priority.
- **User request arrives** → Orch + GP create jobs with `source: "user_request"`, `owner_class: "user"`, high priority.

The Scheduler treats them identically. Priority ordering ensures user requests aren't blocked by background work.

## Throbber / Acknowledgment Pattern

When the Orchestrator creates jobs that won't complete instantly:

1. Start a short timer (default: 10 seconds, configurable per-job-type).
2. If all jobs complete before the timer → deliver the response synchronously (user doesn't see any async behavior).
3. If the timer fires and jobs are still running → deliver an acknowledgment ("Working on it — I'll let you know when it's done") via IOAdapter.
4. When jobs complete → deliver results via IOAdapter as a follow-up message.

This preserves the synchronous feel for fast requests while gracefully handling longer work.

## Open Questions

- **Job store format**: Continue with JSON files in `runtime/jobs/`? Or move to a lightweight DB (SQLite) for query efficiency as job volume grows? JSON files are fine to start.
- **Scheduler lifecycle**: Does the Scheduler run as a persistent loop within the Node process, or is it triggered on-demand? Persistent loop is simpler for the initial implementation.
- **Partial result delivery**: Should the Orchestrator deliver results from completed jobs while siblings are still running, or wait for the full graph? Start with wait-for-all; partial delivery is a UX refinement.
- **Job expiry/cleanup**: How long do completed jobs stay in the store? Retention policy TBD.
- ~~**Graph visualization**~~: Decided — implicit graph is sufficient. `depends_on` fields carry the relationship; any agent or tool can reconstruct the DAG for debugging.
