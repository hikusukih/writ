# Sketch: Jobs as First-Class Entities with Dependency Graphs

## Status: EXPLORATORY — not a spec, not a decision

---

## Core Idea

Replace the linear pipeline (Orch → GenPlanner → LieuPlanner → Developer → Executor) with a
**job graph** where each unit of work is a Job that declares its dependencies on other Jobs.

The Orchestrator and Planners *produce* Jobs. A scheduler *executes* them respecting dependency
order. Jobs that share no dependency can run concurrently.

## What Changes

| Current Model | Job-Graph Model |
|---|---|
| GenPlanner produces a Plan, LieuPlanner refines it, Executor runs it — sequential | GenPlanner produces a set of Jobs with dependency edges |
| "Commission a new script" is a sub-step in LieuPlanner's flow | "Commission a new script" is a Job whose output unblocks a later "run script" Job |
| Long-running work blocks the pipeline | Long-running work is a Job that other Jobs can depend on without blocking unrelated work |
| Orchestrator tracks one chain at a time | Orchestrator (or a scheduler component) tracks a graph of in-flight Jobs |

## Job Schema (Sketch)

```
Job {
  id:           string          // unique, monotonic (enables cycle prevention: can only depend on lower IDs)
  type:         enum            // "execute_script" | "develop_script" | "plan" | "notify_user" | "replan" | "initiative_setup"
  status:       enum            // "pending" | "blocked" | "running" | "completed" | "failed"
  goal:         string          // natural language — what this job is trying to accomplish
  depends_on:   Job.id[]        // jobs that must complete before this one starts
  created_by:   string          // agent or component that created this job
  plan:         Plan | null     // if this job has been planned by a LieuPlanner, the plan lives here
  result:       any | null      // output on completion
  evidence:     StatementRef[]  // references to user statement log entries (see companion sketch)
  callbacks:    Callback[]      // what to do when this job completes (create new jobs, notify, etc.)
  channel:      string[]        // IOAdapter channel(s) to respond on; ["*"] for all active channels
  timestamps: {
    created:    datetime
    started:    datetime | null
    completed:  datetime | null
  }
}
```

### Cycle Prevention

Jobs use monotonically increasing IDs. A job can only declare dependencies on jobs with
*lower* IDs. This makes cycles impossible by construction. If a job needs to "call back"
to a planner or the orchestrator, it does so via a **callback** that *creates a new job*
(with a new, higher ID) — not by depending on a future job.

---

## Use Case 1: Simple — "Give me the weather"

**Setup**: User has asked for Houston weather before. Orchestrator has learned (via USER.MD
or Statement Log) that the user is in Houston. A `weather-fetch` script already exists.

**User input** (via CLI): "Give me the weather"

### Orchestrator's Turn

Orch receives the input. LLM call interprets intent: simple script execution, known location,
known script. No planning needed — this is a fast-path.

Orch does three things nearly simultaneously:
1. **Responds to user**: "Sure, no problem. Just a sec..." (with throbber)
2. **Creates Job-1**:
   ```
   Job-1: {
     type: "execute_script",
     goal: "get current weather for Houston",
     script: "weather-fetch",
     params: { location: "Houston, TX" },
     depends_on: [],
     channel: "cli-session-42",
     callbacks: [{ on: "complete", action: "notify_orchestrator" }]
   }
   ```
3. **Awaits** Job-1 (short job — Orch holds the throbber and waits)

### Execution

Scheduler sees Job-1 has no dependencies, status "pending" → runs it immediately.
Executor → Compiler → `weather-fetch.sh Houston, TX` → result.

Job-1 status → "completed", result populated with weather payload.

### Completion

Callback fires: notify_orchestrator. Orch receives the weather payload. LLM call: synthesize
a natural-language weather response from the payload. Delivers via IOAdapter on `cli-session-42`.

**User sees**: Throbber for ~2 seconds, then "It's 78°F and partly cloudy in Houston."

### What Went Right

- No planner invocation. Orch recognized this as a known pattern with a known script.
- One job, zero dependencies. The job system didn't add overhead — it's just a slightly
  more structured version of what the current synchronous pipeline does.
- Channel tracking means the response goes back where the request came from.

---

## Use Case 2: Complex — "Email me the weather in Phoenix every day at 6am..."

**User input**: "Email me the weather in Phoenix every day at 6am. I'm going on business
next week — throw that on my calendar too."

### Orchestrator's Turn

Orch receives input. LLM call decomposes this into two distinct intents:

1. **Recurring weather email** — ongoing, time-limited (duration of trip), needs Initiative
2. **Calendar entry** — one-shot, can probably be done with an existing script/agent

Orch recognizes intent #1 as an Initiative pattern (recurring + time-bounded). Intent #2 is
a direct action.

Orch does three things:
1. **Responds to user**: "On it — setting up the email and calendar entry." (throbber, 10s max)
2. **Creates two jobs in parallel**:

```
Job-1: {
  type: "initiative_setup",
  goal: "set up recurring daily weather email for Phoenix, 6am, for duration of business trip",
  depends_on: [],
  channel: "cli-session-42",
  callbacks: [{ on: "complete", action: "notify_orchestrator" }]
}

Job-2: {
  type: "execute_script",    // or "agent_call" if CalendarAgent exists
  goal: "add business trip to Phoenix to calendar, next week",
  depends_on: [],
  channel: "cli-session-42",
  callbacks: [{ on: "complete", action: "notify_orchestrator" }]
}
```

3. **Awaits both** (with throbber). If both come back within 10s, collates. If not, acks
   what's done and promises follow-up on what's still running.

### Job-1: Initiative Setup (the interesting one)

Scheduler runs Job-1. This invokes the InitiativeCreationAgent (or InitiativeBuilder per
current spec). The agent:

- Recognizes "every day at 6am" → recurring
- Recognizes "next week" / "business trip" → time-limited, not indefinite
- Needs to determine: trip start date, trip end date, user's email address
- **If it has all this info** (from Statement Log, USER.MD, or calendar integration): proceeds
- **If not**: creates a callback to Orchestrator requesting clarification from the user.
  This becomes a new job:

  ```
  Job-3: {
    type: "notify_user",
    goal: "ask user for trip dates and email address",
    depends_on: [],                    // can fire immediately
    channel: "cli-session-42",
    callbacks: [{ on: "user_responds", action: "create_job", 
                  template: { type: "initiative_setup", ... } }]
  }
  ```

  But let's say the system has enough context. InitiativeCreationAgent proceeds:

- Selects **Static** architecture (weather fetch + email send = deterministic, no runtime LLM)
- Creates sub-jobs:

  ```
  Job-4: {
    type: "execute_script",
    goal: "register cron: weather-fetch Phoenix + email-send → user@email.com, daily 6am",
    depends_on: ["Job-1"],      // waits for initiative setup to finalize
    callbacks: [{ on: "complete", action: "notify_orchestrator" }]
  }

  Job-5: {
    type: "execute_script",
    goal: "register cron: disable weather email cron on [trip-end-date + 1]",
    depends_on: ["Job-4"],      // only schedule the kill after the cron is live
    callbacks: [{ on: "complete", action: "notify_orchestrator" }]
  }
  ```

Job-1 completes once the Initiative definition is persisted and sub-jobs are queued.

### Job-2: Calendar Entry

Runs in parallel with Job-1. CalendarAgent (or script) adds the trip. Done quickly.

### Orchestrator Collation

Both Job-1 and Job-2 callbacks fire. Orch has results from both. If both arrived within the
throbber window:

**User sees**: "Done. I've added your Phoenix trip to your calendar for next week. I'll email
you the weather at 6am every morning while you're there — I'll stop after you're back."

If Job-2 finished fast but Job-1 is still working:

**User sees** (at throbber timeout): "Your calendar's updated. Still setting up the weather
emails — I'll confirm when that's ready." Then later: "All set — daily weather emails for
Phoenix starting Monday, ending Saturday."

### What This Required Going Right

- **Orch correctly decomposed** two intents from one message
- **Orch correctly identified** the recurring pattern as Initiative-worthy
- **InitiativeCreationAgent correctly inferred** time-boundedness from "next week"
- **System had enough context** (email, trip dates) to avoid a clarification round-trip
- **Two parallel job trees** executed without blocking each other
- **Throbber timeout** gracefully degraded to async notification

### What Could Go Wrong

- Orch treats the whole thing as one job → calendar waits for initiative setup
- InitiativeCreationAgent doesn't catch the time-limited aspect → weather emails run forever
- Trip dates are ambiguous ("next week" = which days?) → needs clarification but system guesses
- Email script doesn't exist yet → need a Developer job first, which delays everything
- Cron "kill" job fails → weather emails keep going after the trip

---

## Planner Roles in the Job Model

- **GenPlanner (Strategist)**: Receives interpreted intent from Orchestrator. Decides *how to
  assign resources* — what kinds of jobs are needed, how to partition work, what can parallelize.
  Its output is a set of Jobs (or a PLANXYZ.MD that a Job Factory decomposes into Jobs).
  GenPlanner doesn't care about script-level details — it cares about approach.
- **LieuPlanner (Tactician)**: Receives a single Job of type "plan" (one slice of GenPlanner's
  strategy). Decides *how to get this specific task done* — which scripts, what parameters,
  what order. If the scripts don't exist, LieuPlanner commissions Developer/Writer (by creating
  a "develop_script" Job). LieuPlanner's output is an execution spec.

## Relationship to Existing Components

- **Executor + Compiler**: Receive Jobs of type "execute_script" — unchanged from current role.
- **Developer/Writer**: Receives Jobs of type "develop_script" — unchanged from current role.
- **Orchestrator**: Shifts from "drive the pipeline" to "manage the job graph." Dispatches,
  monitors, routes callbacks, decides when to surface results to user.
- **IOAdapter**: Unchanged. Jobs carry a `channel[]` field. Callbacks that need to reach the
  user route through IOAdapter on the specified channel(s); `["*"]` broadcasts to all active.

## Initiative Table (Separate from Jobs)

An Initiative is NOT just a pattern of jobs — it's a persistent entity with its own table.

```
Initiative {
  id:             string
  definition:     string          // what the goals are, what success looks like
  status:         enum            // "active" | "paused" | "completed" | "stopped"
  cron:           string          // cron expression (e.g. "0 6 * * *")
  architecture:   enum            // "static" | "supervised" | "agentic" | "reactive"
  evidence:       StatementRef[]  // user statements that motivate this initiative
  created_at:     datetime
  stop_condition: string | null   // natural language or date-based condition for auto-stop
}
```

When an Initiative's cron fires, it creates (or references and re-runs) a Job in the Job
table. The Initiative table owns the *why* and *when*; the Job table owns the *what* and *how*.

This means:
- "What are you working on?" → query the Job table for in-flight jobs
- "What ongoing things do I have?" → query the Initiative table for active initiatives
- "Why are you sending me weather emails?" → Initiative → evidence → Statement Log
- "Stop the weather emails" → set Initiative status to "stopped", cancel pending jobs

## Callback Patterns

A Job's `callbacks` field defines what happens on completion:

- **create_job**: Spawn a new Job (with a new ID — no cycles)
- **notify_orchestrator**: Signal the Orch to synthesize a user-facing response
- **notify_planner**: Signal a GenPlanner or LieuPlanner to replan based on new information
- **update_initiative**: Write progress to an Initiative's audit trail

This replaces the need for Initiatives to talk "outside" the IOAdapter to the Orchestrator.
An Initiative's cron fires → creates a Job → Job has callbacks → callbacks can create more
Jobs or notify the Orchestrator. Everything flows through the same mechanism.

## Open Questions

1. **Job Factory**: Who decomposes a GenPlanner's output into Jobs? GenPlanner itself?
   A separate component? The Orchestrator?
2. **Dynamic dependencies**: Can a running Job's callback add dependencies to an existing
   not-yet-started Job? Or can it only create *new* jobs?
3. **Job graph persistence**: Is `depends_on` per-job sufficient, or does the graph need
   its own first-class representation for visualization / debugging?
4. **Review integration**: Per-job review (reviewer checks each job's output before marking
   complete) is probably cleanest — `withReview()` wraps each job execution.
5. **Concurrency limits**: How many jobs can run simultaneously? Per-agent limits?
6. **Throbber timeout**: What's the right default? 10s? Configurable per-job-type?
7. **Fast-path criteria**: How does Orch decide "this is simple enough to skip planning and
   just create an execute_script job directly"? Heuristic? Script-index lookup? LLM judgment?
8. **Orch as scheduler vs. separate scheduler**: Should the Orchestrator own the job queue
   and scheduling, or should that be a separate component? Orch is already complex.