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
