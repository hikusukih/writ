# Tier 4 — Async + Initiatives: Job Graph & Scheduler

Implementation tasks for Phase 3, Tier 4. Introduces asynchronous execution, the Job Graph model, and the Initiative system.

**Important dependency**: Tiers 1–3 should be complete. Human-Judgment Agent (HJA) is needed for Initiative architecture confirmation above Static. The full review chain (including sampling rate) should be operational.

**Architectural transition**: Tier 4 replaces the linear GP → LP → Executor pipeline with job-based dispatch. After Tier 4, all execution is routed through the Job Graph — the linear pipeline no longer exists as a distinct code path.

**Note**: User Statement Log and Initiative Table are Backlog items with their own specs in `docs/planning/backlog/`. They're included here as dependency tasks since the Job Graph and Initiative system require them.

## Relevant Files

- `src/jobs/types.ts` - Job, JobGraph, Callback, JobEvidence types
- `src/jobs/scheduler.ts` - DAG scheduler: dependency resolution, concurrent execution
- `src/jobs/scheduler.test.ts` - Tests for scheduler
- `src/jobs/store.ts` - Persistent job state store (survives restart)
- `src/jobs/store.test.ts` - Tests for job store
- `src/jobs/factory.ts` - Job creation from planner output
- `src/jobs/factory.test.ts` - Tests for job factory
- `src/statements/store.ts` - User Statement Log persistence
- `src/statements/store.test.ts` - Tests for statement store
- `src/statements/types.ts` - Statement, JobEvidence types
- `src/initiatives/types.ts` - Initiative table types
- `src/initiatives/store.ts` - Initiative persistence
- `src/initiatives/store.test.ts` - Tests for initiative store
- `src/initiatives/builder.ts` - InitiativeBuilder agent: creates initiative entries
- `src/initiatives/builder.test.ts` - Tests for builder
- `src/agents/orchestrator.ts` - Major refactor: job dispatch/await model
- `src/agents/orchestrator.test.ts` - Update orchestrator tests
- `src/types.ts` - Shared types extensions
- `src/schemas.ts` - Job, Statement, Initiative schemas
- `src/index.ts` - Async main loop, throbber/ack pattern
- `src/io/IOAdapter.ts` - Add sendAcknowledgment(), sendProgress()
- `src/io/CLIAdapter.ts` - Implement ack/progress for CLI
- `src/instance/identity/registry.json` - Register initiative-builder agent
- `src/instance/identity/agents/initiative-builder-agent.md` - InitiativeBuilder config

### Notes

- Jobs use monotonically increasing IDs for cycle prevention.
- The scheduler can be internal to the Orchestrator initially (separate component deferred).
- Job state persists to `runtime/jobs/`.
- Statement Log persists to `runtime/statements/`.
- Initiative table persists to `runtime/initiatives/`.

## Tasks

- [x] 1.0 Job type system and schemas
  - [x] 1.1 Create `src/jobs/types.ts` with types:
    - `JobType`: `"execute_script" | "develop_script" | "plan" | "notify_user" | "replan" | "initiative_setup"`
    - `JobStatus`: `"pending" | "blocked" | "running" | "completed" | "failed"`
    - `CallbackAction`: `"create_job" | "notify_orchestrator" | "notify_planner" | "update_initiative"`
    - `Callback`: `{ on: "complete" | "fail", action: CallbackAction, payload?: Record<string, unknown> }`
    - `Job`: `{ id: string, type: JobType, status: JobStatus, goal: string, dependsOn: string[], createdBy: string, plan?: Plan | null, result?: unknown, evidence: StatementRef[], callbacks: Callback[], channel: string[], timestamps: { created: string, started?: string, completed?: string } }`
  - [x] 1.2 Add Zod schemas for all Job types in `src/schemas.ts`
  - [x] 1.3 Add `StatementRef` type: `{ statementId: string, relationship: "motivates" | "constrains" | "supersedes_prior" }`

- [x] 2.0 Persistent job state store
  - [x] 2.1 Create `src/jobs/store.ts` with functions:
    - `createJobStore(dir: string): Promise<JobStore>` — factory, ensures directory exists
    - `JobStore.createJob(partial: Omit<Job, "id" | "status" | "timestamps">): Promise<Job>` — assigns monotonic ID, sets status "pending", timestamps.created
    - `JobStore.getJob(id: string): Promise<Job | null>`
    - `JobStore.updateJob(id: string, updates: Partial<Job>): Promise<Job>`
    - `JobStore.getReady(): Promise<Job[]>` — jobs where status is "pending" and all dependsOn are "completed"
    - `JobStore.getRunning(): Promise<Job[]>`
    - `JobStore.getAll(): Promise<Job[]>`
  - [x] 2.2 Persistence: JSON file per job in `runtime/jobs/{id}.json`. On startup, scan directory to rebuild in-memory state. Writes are synchronous to disk (jobs are infrequent enough that this is fine).
  - [x] 2.3 Monotonic ID generation: on startup, read highest existing ID from stored jobs. New IDs increment from there. ID format: `job-{number}` (e.g., `job-1`, `job-2`).
  - [x] 2.4 Cycle prevention validation: `createJob()` verifies all `dependsOn` IDs are lower than the new job's numeric ID. Throws if not.
  - [x] 2.5 Write tests: create, get, update, getReady (dependency resolution), monotonic IDs, cycle prevention, persistence round-trip (write + re-read on fresh store).

- [ ] 3.0 Job scheduler
  - [ ] 3.1 Create `src/jobs/scheduler.ts` with function: `createScheduler(store: JobStore, executor: JobExecutor, adapter: IOAdapter): Scheduler`. The adapter is stored at scheduler level and passed to job executors for FAFC routing, notifications, and channel-based result delivery.
    - `Scheduler.tick(): Promise<void>` — check for ready jobs, start them (up to concurrency limit), process callbacks for completed jobs
    - `Scheduler.run(): Promise<void>` — loop: tick, sleep 100ms, repeat until no running or pending jobs
    - `Scheduler.submitJob(partial): Promise<Job>` — create job via store, return it
    - `Scheduler.waitForJob(id: string, timeoutMs?: number): Promise<Job>` — resolves when job reaches "completed" or "failed"
  - [ ] 3.2 Define `JobExecutor` interface: `{ execute(job: Job): Promise<unknown> }` — the scheduler calls this to run a job. Different job types dispatch to different execution paths.
  - [ ] 3.3 Implement `DefaultJobExecutor` that routes by job type:
    - `execute_script` → existing `executeFromPlan()` path
    - `develop_script` → Developer/Writer `generateScript()`
    - `plan` → Lieutenant Planner `createDetailedPlan()`
    - `notify_user` → IOAdapter `sendResult()`
    - `replan` → GP `createStrategicPlan()`
    - `initiative_setup` → InitiativeBuilder
  - [ ] 3.4 Callback processing: when a job completes, iterate its callbacks. For `create_job`, call `store.createJob()` with the callback payload. For `notify_orchestrator`, emit an event (EventEmitter or callback function). For `update_initiative`, update the Initiative store.
  - [ ] 3.5 Concurrency limit: configurable, default 3 concurrent jobs. Ready jobs beyond the limit wait.
  - [ ] 3.6 Write tests: single job execution. Dependency chain (A → B → C). Parallel independent jobs. Callback creates new job. Concurrency limit enforced. Timeout on waitForJob.

- [ ] 4.0 Throbber / acknowledgment pattern in IOAdapter
  - [ ] 4.1 Add `sendAcknowledgment(message: string): void | Promise<void>` to IOAdapter interface — for "Working on it, I'll follow up"
  - [ ] 4.2 Add `sendProgress(jobId: string, message: string): void | Promise<void>` to IOAdapter interface — for periodic updates on long-running jobs
  - [ ] 4.3 Implement both in CLIAdapter: sendAcknowledgment prints the message; sendProgress prints `[job-N] message`
  - [ ] 4.4 Implement throbber timeout in orchestrator: for each job, set a timeout (configurable per job type, default 10s). If job completes within timeout → synchronous response. If not → call `adapter.sendAcknowledgment()` and follow up asynchronously.
  - [ ] 4.5 Write tests for ack/progress in CLIAdapter.

- [ ] 5.0 Refactor Orchestrator to job-based dispatch
  - [ ] 5.1 Update `handleRequest()` to use the scheduler for all execution. Instead of directly calling createPlan() → executeFromPlan(), create jobs and submit them to the scheduler.
  - [ ] 5.2 Simple request path: Orchestrator creates a single `execute_script` or `plan` job → waits for completion → synthesizes response. Functionally identical to current behavior, but routed through the job system.
  - [ ] 5.3 Complex request path: Orchestrator creates multiple jobs with dependencies → scheduler runs them → Orchestrator collects results → synthesizes response.
  - [ ] 5.4 Keep backward compatibility: if scheduler is not initialized (e.g., tests that don't set it up), fall back to direct execution. This prevents breaking existing tests.
  - [ ] 5.5 Channel routing: jobs carry `channel: string[]` from the IOAdapter that received the request. Results route back to the same channel.
  - [ ] 5.6 Update provenance chain to include job IDs.
  - [ ] 5.7 Write tests: simple request via job system. Multi-job request. Throbber timeout triggers ack. Backward compatibility (no scheduler).

- [ ] 6.0 User Statement Log
  - [ ] 6.1 Create `src/statements/types.ts` with types:
    - `Statement`: `{ id: string, text: string, source: string, timestamp: string, context?: string, supersededBy?: string }`
    - `JobEvidence`: `{ jobId: string, statementId: string, relationship: "motivates" | "constrains" | "supersedes_prior" }`
  - [ ] 6.2 Create `src/statements/store.ts` with functions:
    - `createStatementStore(dir: string): Promise<StatementStore>`
    - `StatementStore.add(text: string, source: string, context?: string): Promise<Statement>`
    - `StatementStore.get(id: string): Promise<Statement | null>`
    - `StatementStore.supersede(oldId: string, newId: string): Promise<void>`
    - `StatementStore.linkToJob(jobId: string, statementId: string, relationship: string): Promise<void>`
    - `StatementStore.getEvidenceForJob(jobId: string): Promise<JobEvidence[]>`
    - `StatementStore.getJobsForStatement(statementId: string): Promise<JobEvidence[]>`
  - [ ] 6.3 Persistence: `runtime/statements/statements.jsonl` (append-only) + `runtime/statements/evidence.jsonl` (append-only join table).
  - [ ] 6.4 Wire into orchestrator: when Orchestrator interprets a user request, extract actionable statements and add to the Statement Log. Link statements to created jobs as evidence.
  - [ ] 6.5 Write tests: add, get, supersede, link, query by job, query by statement, persistence.

- [ ] 7.0 Initiative Table & Persistence
  - [ ] 7.1 Create `src/initiatives/types.ts` with types:
    - `InitiativeStatus`: `"active" | "paused" | "completed" | "stopped"`
    - `InitiativeArchitecture`: `"static" | "supervised" | "agentic" | "reactive"`
    - `Initiative`: `{ id: string, definition: string, status: InitiativeStatus, cron: string, architecture: InitiativeArchitecture, evidence: StatementRef[], createdAt: string, stopCondition?: string }`
  - [ ] 7.2 Create `src/initiatives/store.ts` with functions:
    - `createInitiativeStore(dir: string): Promise<InitiativeStore>`
    - `InitiativeStore.create(partial: Omit<Initiative, "id" | "createdAt">): Promise<Initiative>`
    - `InitiativeStore.get(id: string): Promise<Initiative | null>`
    - `InitiativeStore.update(id: string, updates: Partial<Initiative>): Promise<Initiative>`
    - `InitiativeStore.getActive(): Promise<Initiative[]>`
    - `InitiativeStore.stop(id: string): Promise<Initiative>`
  - [ ] 7.3 Persistence: `runtime/initiatives/{id}.json`.
  - [ ] 7.4 Write tests: create, get, update, getActive, stop, persistence round-trip.

- [ ] 8.0 InitiativeBuilder agent
  - [ ] 8.1 Add `initiative-builder` entry to `registry.json`: id "initiative-builder", class "action", configFile "initiative-builder-agent.md"
  - [ ] 8.2 Create `src/instance/identity/agents/initiative-builder-agent.md`: Agent config for building initiatives. Role: receive a user request identified as initiative-worthy by the Orchestrator. Determine: goals, success criteria, cron expression, architecture type, stop condition. Output: Initiative definition. For architectures above Static, route through HJA for user confirmation.
  - [ ] 8.3 Create `src/initiatives/builder.ts` with function: `buildInitiative(client: LLMClient, request: string, identity: IdentityContext, adapter: IOAdapter, statementStore: StatementStore): Promise<Initiative>`. LLM call to determine initiative parameters. Create statement log entries for the user's request. For non-Static architectures, request HJA confirmation. Create Initiative entry in store.
  - [ ] 8.4 Wire into Orchestrator: when Orchestrator identifies a request as initiative-worthy (recurring pattern, time-bounded task), create an `initiative_setup` job → scheduler runs it → InitiativeBuilder creates the initiative.
  - [ ] 8.5 Cron trigger (stub): create `src/initiatives/cron.ts` with function: `checkInitiatives(store: InitiativeStore, jobStore: JobStore): Promise<void>`. For each active initiative, evaluate cron expression against current time. If due, create a job in the job store. For stop conditions, evaluate and update initiative status. **Initially**: this is called on each orchestrator tick, not via system cron.
  - [ ] 8.6 Write tests: initiative creation via LLM. Architecture confirmation via HJA. Cron evaluation. Stop condition evaluation. Job creation from initiative.
