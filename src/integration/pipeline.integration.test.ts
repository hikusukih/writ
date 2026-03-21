/**
 * Integration Smoke Tests — Full DomestiClaw Pipeline
 *
 * These tests exercise the assembled pipeline end-to-end by importing and
 * calling system functions directly (no process spawning). LLM calls are
 * mocked by default. Set USE_REAL_LLM=1 to run tests 1-3 against the real
 * API; tests 4-5 are always mock-only.
 *
 * Test pattern: create TestAdapter + MockLLMClient (or real client),
 * call handleRequest(), assert on TestAdapter's collected outputs.
 *
 * Run:
 *   npm run test:integration          — mocked LLM
 *   USE_REAL_LLM=1 npm run test:integration  — real API (tests 4-5 skip)
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, readdir, access, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { handleRequest } from "../agents/orchestrator.js";
import { ReviewHaltError } from "../agents/reviewed.js";
import { loadIdentity } from "../identity/loader.js";
import { createClaudeClient } from "../agents/claude-client.js";
import { createTestAdapter } from "../io/TestAdapter.js";
import { createMockLLMClient } from "../test-utils/MockLLMClient.js";
import { createJobStore } from "../jobs/store.js";
import { createScheduler } from "../jobs/scheduler.js";
import { createDefaultJobExecutor } from "../jobs/defaultExecutor.js";
import type { JobExecutor } from "../jobs/scheduler.js";
import type { Job } from "../jobs/types.js";
import type { IOAdapter } from "../io/IOAdapter.js";
import type { LLMClient } from "../agents/claude-client.js";
import type { IdentityContext } from "../types.js";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const USE_REAL_LLM = process.env.USE_REAL_LLM === "1";
const MOCK_ONLY = !USE_REAL_LLM;

// Project root is the cwd when running tests via npm scripts
const PROJECT_ROOT = process.cwd();
const INSTANCE_IDENTITY_DIR = join(PROJECT_ROOT, "src", "instance", "identity");
const INSTANCE_SCRIPTS_DIR = join(PROJECT_ROOT, "src", "instance", "scripts");

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

let identity: IdentityContext;

beforeAll(async () => {
  identity = await loadIdentity(INSTANCE_IDENTITY_DIR);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient(): LLMClient {
  if (USE_REAL_LLM) {
    return createClaudeClient();
  }
  return createMockLLMClient();
}

async function makeTmpPlansDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "writ-integ-plans-"));
  return dir;
}

// ---------------------------------------------------------------------------
// Test 1 — Basic Request → Response
//
// Validates: Full pipeline wiring from Orchestrator through GP → LP →
// Executor → Compiler → response generation, with review at each stage.
// ---------------------------------------------------------------------------

describe("1. Basic Request → Response", () => {
  let plansDir: string;

  beforeAll(async () => {
    plansDir = await makeTmpPlansDir();
  });

  afterAll(async () => {
    await rm(plansDir, { recursive: true, force: true });
  });

  it("returns a non-empty response with no errors", async () => {
    const client = makeClient();
    const adapter = createTestAdapter();

    const result = await handleRequest(
      client,
      "Hello, who are you?",
      identity,
      INSTANCE_SCRIPTS_DIR,
      plansDir,
      undefined,
      /* skipReview */ false,
      adapter
    );

    expect(result.response).toBeTruthy();
    expect(typeof result.response).toBe("string");
    expect(result.response.length).toBeGreaterThan(0);
    expect(adapter.collected.errors).toHaveLength(0);
  }, 30_000);

  it("includes a provenance chain spanning orchestrator → planner → lieutenant-planner → executor", async () => {
    const client = makeClient();
    const adapter = createTestAdapter();
    const localPlansDir = await makeTmpPlansDir();

    try {
      const result = await handleRequest(
        client,
        "Hello, who are you?",
        identity,
        INSTANCE_SCRIPTS_DIR,
        localPlansDir,
        undefined,
        false,
        adapter
      );

      const agentIds = result.provenance.map((p) => p.agentId);
      expect(agentIds).toContain("orchestrator");
      expect(agentIds).toContain("planner");
      expect(agentIds).toContain("lieutenant-planner");
      expect(agentIds).toContain("executor");
    } finally {
      await rm(localPlansDir, { recursive: true, force: true });
    }
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Test 2 — Script Execution
//
// Validates: Script index discovery, Executor → Compiler → script runner path.
// The mock LP returns a plan referencing list-files, which actually runs.
// ---------------------------------------------------------------------------

describe("2. Script Execution", () => {
  let plansDir: string;

  beforeAll(async () => {
    plansDir = await makeTmpPlansDir();
  });

  afterAll(async () => {
    await rm(plansDir, { recursive: true, force: true });
  });

  it("executes a known bootstrap script and returns its output in the response", async () => {
    const client = makeClient();
    const adapter = createTestAdapter();

    const result = await handleRequest(
      client,
      "List the files in the project root",
      identity,
      INSTANCE_SCRIPTS_DIR,
      plansDir,
      undefined,
      false,
      adapter
    );

    expect(result.response).toBeTruthy();
    // Verify executor ran: provenance must include executor entry
    const executorEntry = result.provenance.find((p) => p.agentId === "executor");
    expect(executorEntry).toBeDefined();
    expect(adapter.collected.errors).toHaveLength(0);

    // When mocked: sideEffects should mention list-files
    if (MOCK_ONLY) {
      expect(result.sideEffects).toContain("list-files");
    }
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Test 3 — Review Chain Runs
//
// Validates: withReview() / applyReview() wiring. Verifies review is invoked
// at least once per request (not accidentally bypassed).
// ---------------------------------------------------------------------------

describe("3. Review Chain Runs", () => {
  let plansDir: string;

  beforeAll(async () => {
    plansDir = await makeTmpPlansDir();
  });

  afterAll(async () => {
    await rm(plansDir, { recursive: true, force: true });
  });

  it("invokes the LLM reviewer at least once during a request", async () => {
    // Use the mock client (regardless of USE_REAL_LLM) so we can track calls
    const client = createMockLLMClient();
    const adapter = createTestAdapter();

    await handleRequest(
      client,
      "List the files in the project root",
      identity,
      INSTANCE_SCRIPTS_DIR,
      plansDir,
      undefined,
      /* skipReview */ false,
      adapter
    );

    expect(client.callLog).toContain("reviewer");
    expect(client.callLog.filter((c) => c === "reviewer").length).toBeGreaterThanOrEqual(1);
    expect(adapter.collected.errors).toHaveLength(0);
  }, 30_000);

  it("does not invoke the reviewer when skipReview is true", async () => {
    const client = createMockLLMClient();
    const adapter = createTestAdapter();
    const localPlansDir = await makeTmpPlansDir();

    try {
      await handleRequest(
        client,
        "List the files",
        identity,
        INSTANCE_SCRIPTS_DIR,
        localPlansDir,
        undefined,
        /* skipReview */ true,
        adapter
      );

      expect(client.callLog).not.toContain("reviewer");
    } finally {
      await rm(localPlansDir, { recursive: true, force: true });
    }
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Test 4 — FAFC Privilege Escalation  (mock-only)
//
// Validates: HJA integration, FAFC routing through IOAdapter.
// ---------------------------------------------------------------------------

describe("4. FAFC Privilege Escalation", () => {
  it.skipIf(USE_REAL_LLM)(
    "routes FAFC decision through adapter and continues when user approves",
    async () => {
      const plansDir = await makeTmpPlansDir();

      try {
        const fafcDecision = JSON.stringify({
          decision: "fafc",
          reasoning: "This action requires explicit human approval.",
          summary: "The system wants to perform an action that needs your sign-off.",
        });

        const client = createMockLLMClient({ reviewerDecision: fafcDecision });
        const adapter = createTestAdapter({ confirmationAnswer: true });

        const result = await handleRequest(
          client,
          "List the files in the project root",
          identity,
          INSTANCE_SCRIPTS_DIR,
          plansDir,
          undefined,
          false,
          adapter
        );

        // At least one FAFC confirmation was requested
        expect(adapter.collected.confirmationRequests.length).toBeGreaterThanOrEqual(1);
        // Pipeline completed (no error thrown)
        expect(result.response).toBeTruthy();
      } finally {
        await rm(plansDir, { recursive: true, force: true });
      }
    },
    30_000
  );

  it.skipIf(USE_REAL_LLM)(
    "halts the pipeline when user denies the FAFC confirmation",
    async () => {
      const plansDir = await makeTmpPlansDir();

      try {
        const fafcDecision = JSON.stringify({
          decision: "fafc",
          reasoning: "This action requires explicit human approval.",
          summary: "The system wants to perform an action that needs your sign-off.",
        });

        const client = createMockLLMClient({ reviewerDecision: fafcDecision });
        const adapter = createTestAdapter({ confirmationAnswer: false });

        await expect(
          handleRequest(
            client,
            "List the files in the project root",
            identity,
            INSTANCE_SCRIPTS_DIR,
            plansDir,
            undefined,
            false,
            adapter
          )
        ).rejects.toThrow(ReviewHaltError);

        // A confirmation was requested before the halt
        expect(adapter.collected.confirmationRequests.length).toBeGreaterThanOrEqual(1);
      } finally {
        await rm(plansDir, { recursive: true, force: true });
      }
    },
    30_000
  );
});

// ---------------------------------------------------------------------------
// Test 5 — Developer/Writer Trigger  (mock-only)
//
// Validates: LP → DW commissioning path, staging directory, DW review.
// ---------------------------------------------------------------------------

describe("5. Developer/Writer Trigger", () => {
  let scriptsDir: string;
  let plansDir: string;

  beforeAll(async () => {
    // Use a temp scripts dir so DW can promote new scripts without touching
    // the real instance scripts directory
    const base = await mkdtemp(join(tmpdir(), "writ-integ-dw-"));
    scriptsDir = join(base, "scripts");
    plansDir = join(base, "plans");
    await mkdir(scriptsDir, { recursive: true });
    await mkdir(plansDir, { recursive: true });
  });

  afterAll(async () => {
    // Clean up temp dirs
    const base = join(scriptsDir, "..");
    await rm(base, { recursive: true, force: true });

    // Clean up anything staged to the real runtime staging dir
    try {
      const stagingDir = join(PROJECT_ROOT, "runtime", "staging", "scripts");
      const files = await readdir(stagingDir);
      for (const f of files) {
        if (f === "custom-output.sh") {
          await rm(join(stagingDir, f), { force: true });
        }
      }
    } catch {
      // Staging dir may not exist — that's fine
    }
  });

  it.skipIf(USE_REAL_LLM)(
    "invokes Developer/Writer when LP reports a missing script capability",
    async () => {
      const client = createMockLLMClient({ firstLPMissing: true });
      const adapter = createTestAdapter();

      const result = await handleRequest(
        client,
        "Generate some custom output",
        identity,
        scriptsDir,
        plansDir,
        undefined,
        false,
        adapter
      );

      // DW was invoked
      expect(client.callLog).toContain("dw-generate");

      // Reviewer was called for the DW-generated script
      expect(client.callLog.filter((c) => c === "reviewer").length).toBeGreaterThanOrEqual(1);

      // The promoted script is in the scripts dir
      const promotedPath = join(scriptsDir, "custom-output.sh");
      await expect(access(promotedPath)).resolves.toBeUndefined();

      // Pipeline completed without error
      expect(result.response).toBeTruthy();
      expect(adapter.collected.errors).toHaveLength(0);
    },
    30_000
  );
});

// ---------------------------------------------------------------------------
// Test 7 — Orchestrator → Scheduler → DefaultJobExecutor  (mock-only)
//
// Validates: handleRequest() routes LP + execute through a provided Scheduler.
// External behavior is unchanged; jobs are created in the job store.
// ---------------------------------------------------------------------------

describe("7. Orchestrator → Scheduler → DefaultJobExecutor", () => {
  it.skipIf(USE_REAL_LLM)(
    "handleRequest routes execution through scheduler and returns same result as direct call",
    async () => {
      const plansDir = await makeTmpPlansDir();
      const jobsDir = await mkdtemp(join(tmpdir(), "writ-integ-orch-jobs-"));

      try {
        const client = createMockLLMClient();
        const adapter = createTestAdapter();

        const store = await createJobStore(jobsDir);
        const executor = createDefaultJobExecutor({
          client,
          identity,
          scriptsDir: INSTANCE_SCRIPTS_DIR,
          plansDir,
          skipReview: false,
          getStore: () => store,
        });
        const scheduler = createScheduler(store, executor, adapter);

        const result = await handleRequest(
          client,
          "List the files in the project root",
          identity,
          INSTANCE_SCRIPTS_DIR,
          plansDir,
          undefined,
          false,
          adapter,
          scheduler
        );

        // Pipeline completes successfully
        expect(result.response).toBeTruthy();
        expect(adapter.collected.errors).toHaveLength(0);

        // Provenance chain includes all expected agents
        const agentIds = result.provenance.map((p) => p.agentId);
        expect(agentIds).toContain("orchestrator");
        expect(agentIds).toContain("planner");
        expect(agentIds).toContain("lieutenant-planner");
        expect(agentIds).toContain("executor");

        // Jobs were created in the store (at least plan + execute per assignment)
        const jobs = await store.getAll();
        expect(jobs.length).toBeGreaterThanOrEqual(2);
        const completedJobs = jobs.filter((j) => j.status === "completed");
        expect(completedJobs.length).toBe(jobs.length);
      } finally {
        await rm(plansDir, { recursive: true, force: true });
        await rm(jobsDir, { recursive: true, force: true });
      }
    },
    30_000
  );
});

// ---------------------------------------------------------------------------
// Test 6 — DefaultJobExecutor + Scheduler Integration  (mock-only)
//
// Validates: Scheduler + DefaultJobExecutor wiring end-to-end with MockLLMClient.
// Submits a "plan" job, runs the scheduler, verifies the job completes with a
// plan structure.
// ---------------------------------------------------------------------------

describe("6. DefaultJobExecutor + Scheduler", () => {
  it.skipIf(USE_REAL_LLM)(
    "plan job completes through scheduler + DefaultJobExecutor and returns a plan structure",
    async () => {
      const jobsDir = await mkdtemp(join(tmpdir(), "writ-integ-jobs-"));
      const plansDir = await mkdtemp(join(tmpdir(), "writ-integ-exec-plans-"));

      try {
        const client = createMockLLMClient();
        const store = await createJobStore(jobsDir);
        const executor = createDefaultJobExecutor({
          client,
          identity,
          scriptsDir: INSTANCE_SCRIPTS_DIR,
          plansDir,
        });
        const scheduler = createScheduler(store, executor, undefined);

        const job = await scheduler.submitJob({
          type: "plan",
          goal: "Execute the task",
          dependsOn: [],
          createdBy: "test",
          evidence: [],
          callbacks: [],
          channel: [],
        });

        scheduler.tick();
        const completed = await scheduler.waitForJob(job.id, 15_000);

        expect(completed.status).toBe("completed");
        expect(completed.result).toBeDefined();

        // Result should be a LieutenantPlanResult with a plan field
        const result = completed.result as { plan?: { id?: string; steps?: unknown[] }; missingScripts?: unknown[] };
        expect(result.plan).toBeDefined();
        expect(result.plan?.id).toBeTruthy();
        expect(Array.isArray(result.plan?.steps)).toBe(true);
        expect(Array.isArray(result.missingScripts)).toBe(true);
      } finally {
        await rm(jobsDir, { recursive: true, force: true });
        await rm(plansDir, { recursive: true, force: true });
      }
    },
    30_000
  );
});

// ---------------------------------------------------------------------------
// Test 8 — Throbber Timeout  (mock-only, Task 4.4)
//
// Validates: when a job takes longer than throbberTimeoutMs, the orchestrator
// sends an acknowledgment and later delivers the result via adapter.sendResult().
// ---------------------------------------------------------------------------

describe("8. Throbber Timeout", () => {
  it.skipIf(USE_REAL_LLM)(
    "sends acknowledgment for slow jobs and delivers result via adapter.sendResult()",
    async () => {
      const plansDir = await makeTmpPlansDir();
      const jobsDir = await mkdtemp(join(tmpdir(), "writ-integ-throbber-jobs-"));

      try {
        const client = createMockLLMClient();
        const adapter = createTestAdapter();

        const store = await createJobStore(jobsDir);
        const realExecutor = createDefaultJobExecutor({
          client,
          identity,
          scriptsDir: INSTANCE_SCRIPTS_DIR,
          plansDir,
          skipReview: true,
          getStore: () => store,
        });

        // Wrap the real executor with a 500 ms artificial delay so the throbber fires
        const slowExecutor: JobExecutor = {
          async execute(job: Job, adp: IOAdapter | undefined): Promise<unknown> {
            await new Promise<void>((r) => setTimeout(r, 500));
            return realExecutor.execute(job, adp);
          },
        };

        const scheduler = createScheduler(store, slowExecutor, adapter, { tickIntervalMs: 50 });

        const result = await handleRequest(
          client,
          "Hello, who are you?",
          identity,
          INSTANCE_SCRIPTS_DIR,
          plansDir,
          undefined,
          /* skipReview */ true,
          adapter,
          scheduler,
          { throbberTimeoutMs: 50 }  // fires well before the 500 ms executor delay
        );

        // Acknowledgment must have been sent
        expect(adapter.collected.acknowledgments.length).toBeGreaterThanOrEqual(1);
        expect(adapter.collected.acknowledgments[0]).toContain("Working on it");

        // handleRequest() delivered the result asynchronously
        expect(result.didAck).toBe(true);
        expect(adapter.collected.results.length).toBeGreaterThanOrEqual(1);

        // The return value still carries the response
        expect(result.response).toBeTruthy();
        expect(adapter.collected.errors).toHaveLength(0);
      } finally {
        await rm(plansDir, { recursive: true, force: true });
        await rm(jobsDir, { recursive: true, force: true });
      }
    },
    10_000
  );

  it.skipIf(USE_REAL_LLM)(
    "responds synchronously (no ack) when job completes within the timeout",
    async () => {
      const plansDir = await makeTmpPlansDir();
      const jobsDir = await mkdtemp(join(tmpdir(), "writ-integ-throbber-fast-"));

      try {
        const client = createMockLLMClient();
        const adapter = createTestAdapter();

        const store = await createJobStore(jobsDir);
        const executor = createDefaultJobExecutor({
          client,
          identity,
          scriptsDir: INSTANCE_SCRIPTS_DIR,
          plansDir,
          skipReview: true,
          getStore: () => store,
        });
        const scheduler = createScheduler(store, executor, adapter, { tickIntervalMs: 50 });

        const result = await handleRequest(
          client,
          "Hello, who are you?",
          identity,
          INSTANCE_SCRIPTS_DIR,
          plansDir,
          undefined,
          true,
          adapter,
          scheduler,
          { throbberTimeoutMs: 10_000 }  // large timeout — should not fire
        );

        // No acknowledgment sent (job completed within timeout)
        expect(adapter.collected.acknowledgments).toHaveLength(0);
        expect(result.didAck).toBeFalsy();
        // sendResult() not called by orchestrator — result returned normally
        expect(adapter.collected.results).toHaveLength(0);
        expect(result.response).toBeTruthy();
      } finally {
        await rm(plansDir, { recursive: true, force: true });
        await rm(jobsDir, { recursive: true, force: true });
      }
    },
    30_000
  );
});

// ---------------------------------------------------------------------------
// Test 9 — Multi-Job DAG Execution  (mock-only, Task 5.3)
//
// Validates: orchestrator submits plan + execute jobs as a dependency DAG,
// both jobs complete in order, and the final result is returned.
// ---------------------------------------------------------------------------

describe("9. Multi-Job DAG Execution", () => {
  it.skipIf(USE_REAL_LLM)(
    "submits plan and execute jobs as a DAG and completes both in dependency order",
    async () => {
      const plansDir = await makeTmpPlansDir();
      const jobsDir = await mkdtemp(join(tmpdir(), "writ-integ-dag-jobs-"));

      try {
        const client = createMockLLMClient();
        const adapter = createTestAdapter();

        const store = await createJobStore(jobsDir);
        const executor = createDefaultJobExecutor({
          client,
          identity,
          scriptsDir: INSTANCE_SCRIPTS_DIR,
          plansDir,
          skipReview: true,
          getStore: () => store,
        });
        const scheduler = createScheduler(store, executor, adapter);

        const result = await handleRequest(
          client,
          "List the files in the project root",
          identity,
          INSTANCE_SCRIPTS_DIR,
          plansDir,
          undefined,
          true,
          adapter,
          scheduler
        );

        // Pipeline completes successfully
        expect(result.response).toBeTruthy();
        expect(adapter.collected.errors).toHaveLength(0);

        // At least plan + execute jobs were created per assignment
        const jobs = await store.getAll();
        expect(jobs.length).toBeGreaterThanOrEqual(2);

        const planJobs = jobs.filter((j) => j.type === "plan");
        const execJobs = jobs.filter((j) => j.type === "execute_script");
        expect(planJobs.length).toBeGreaterThanOrEqual(1);
        expect(execJobs.length).toBeGreaterThanOrEqual(1);

        // All jobs completed
        const allCompleted = jobs.every((j) => j.status === "completed");
        expect(allCompleted).toBe(true);

        // Execute job depends on plan job (DAG edge)
        const execJob = execJobs[0];
        const planJob = planJobs[0];
        expect(execJob.dependsOn).toContain(planJob.id);

        // Plan job has a lower numeric ID than the execute job (DAG ordering check)
        const planNum = parseInt(planJob.id.replace("job-", ""), 10);
        const execNum = parseInt(execJob.id.replace("job-", ""), 10);
        expect(planNum).toBeLessThan(execNum);
      } finally {
        await rm(plansDir, { recursive: true, force: true });
        await rm(jobsDir, { recursive: true, force: true });
      }
    },
    30_000
  );
});

// ---------------------------------------------------------------------------
// Test 10 — Channel Routing  (mock-only, Task 5.5)
//
// Validates: jobs created by the orchestrator carry a non-empty channel array
// populated from the originating adapter.
// ---------------------------------------------------------------------------

describe("10. Channel Routing", () => {
  it.skipIf(USE_REAL_LLM)(
    "jobs created by the orchestrator carry the adapter channel",
    async () => {
      const plansDir = await makeTmpPlansDir();
      const jobsDir = await mkdtemp(join(tmpdir(), "writ-integ-channel-jobs-"));

      try {
        const client = createMockLLMClient();
        const adapter = createTestAdapter();

        // TestAdapter.getChannel() returns ["test"]
        expect(adapter.getChannel()).toEqual(["test"]);

        const store = await createJobStore(jobsDir);
        const executor = createDefaultJobExecutor({
          client,
          identity,
          scriptsDir: INSTANCE_SCRIPTS_DIR,
          plansDir,
          skipReview: true,
          getStore: () => store,
        });
        const scheduler = createScheduler(store, executor, adapter);

        await handleRequest(
          client,
          "Hello, who are you?",
          identity,
          INSTANCE_SCRIPTS_DIR,
          plansDir,
          undefined,
          true,
          adapter,
          scheduler
        );

        // Every job created by the orchestrator should carry the adapter channel
        const jobs = await store.getAll();
        expect(jobs.length).toBeGreaterThan(0);
        for (const job of jobs) {
          expect(job.channel).toEqual(["test"]);
        }
      } finally {
        await rm(plansDir, { recursive: true, force: true });
        await rm(jobsDir, { recursive: true, force: true });
      }
    },
    30_000
  );
});

// ---------------------------------------------------------------------------
// Test 11 — Provenance Chain with Job IDs  (mock-only, Task 5.6)
//
// Validates: provenance entries include jobId, and executor entry references
// the parent plan job via parentJobId.
// ---------------------------------------------------------------------------

describe("11. Provenance Chain with Job IDs", () => {
  it.skipIf(USE_REAL_LLM)(
    "provenance entries include jobId and executor entry references parent plan job",
    async () => {
      const plansDir = await makeTmpPlansDir();
      const jobsDir = await mkdtemp(join(tmpdir(), "writ-integ-prov-jobs-"));

      try {
        const client = createMockLLMClient();
        const adapter = createTestAdapter();

        const store = await createJobStore(jobsDir);
        const executor = createDefaultJobExecutor({
          client,
          identity,
          scriptsDir: INSTANCE_SCRIPTS_DIR,
          plansDir,
          skipReview: true,
          getStore: () => store,
        });
        const scheduler = createScheduler(store, executor, adapter);

        const result = await handleRequest(
          client,
          "List the files in the project root",
          identity,
          INSTANCE_SCRIPTS_DIR,
          plansDir,
          undefined,
          true,
          adapter,
          scheduler
        );

        // lieutenant-planner provenance entry carries jobId
        const lpEntry = result.provenance.find((p) => p.agentId === "lieutenant-planner");
        expect(lpEntry).toBeDefined();
        expect(lpEntry?.jobId).toBeTruthy();

        // executor provenance entry carries jobId AND parentJobId
        const execEntry = result.provenance.find((p) => p.agentId === "executor");
        expect(execEntry).toBeDefined();
        expect(execEntry?.jobId).toBeTruthy();
        expect(execEntry?.parentJobId).toBeTruthy();

        // executor's parentJobId matches lieutenant-planner's jobId
        expect(execEntry?.parentJobId).toBe(lpEntry?.jobId);
      } finally {
        await rm(plansDir, { recursive: true, force: true });
        await rm(jobsDir, { recursive: true, force: true });
      }
    },
    30_000
  );
});

// ---------------------------------------------------------------------------
// Test 12 — Per-Agent ID Wiring  (mock-only)
//
// Validates: agentId is threaded through to sendMessage/sendMessages so that
// Ollama model selection can vary per agent. Asserts the orchestrator's LLM
// calls carry the correct agentId.
// ---------------------------------------------------------------------------

describe("12. Per-Agent ID Wiring", () => {
  it.skipIf(USE_REAL_LLM)(
    "passes agentId to sendMessage for orchestrator calls",
    async () => {
      const plansDir = await makeTmpPlansDir();

      try {
        const client = createMockLLMClient();
        const adapter = createTestAdapter();

        await handleRequest(
          client,
          "Hello, who are you?",
          identity,
          INSTANCE_SCRIPTS_DIR,
          plansDir,
          undefined,
          /* skipReview */ true,
          adapter
        );

        // Orchestrator calls sendMessage with agentId "orchestrator"
        expect(client.agentIdLog).toContain("orchestrator");

        // All logged agentIds should be defined strings (no undefined from the pipeline agents)
        const definedIds = client.agentIdLog.filter((id) => id !== undefined);
        expect(definedIds.length).toBeGreaterThan(0);
        for (const id of definedIds) {
          expect(typeof id).toBe("string");
          expect((id as string).length).toBeGreaterThan(0);
        }
      } finally {
        await rm(plansDir, { recursive: true, force: true });
      }
    },
    30_000
  );
});
