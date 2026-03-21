import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDefaultJobExecutor } from "./defaultExecutor.js";
import type { Job } from "./types.js";
import type { IOAdapter } from "../io/IOAdapter.js";
import type { LLMClient } from "../agents/claude-client.js";
import type { IdentityContext, Plan } from "../types.js";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../agents/executor.js", () => ({
  executeFromPlan: vi.fn(),
}));

vi.mock("../agents/developer-writer.js", () => ({
  generateScript: vi.fn(),
}));

vi.mock("../agents/lieutenant-planner.js", () => ({
  createDetailedPlanWithDW: vi.fn(),
}));

vi.mock("../agents/planner.js", () => ({
  createStrategicPlan: vi.fn(),
}));

vi.mock("../scripts/index.js", () => ({
  listScripts: vi.fn(),
}));

import { executeFromPlan } from "../agents/executor.js";
import { generateScript } from "../agents/developer-writer.js";
import { createDetailedPlanWithDW } from "../agents/lieutenant-planner.js";
import { createStrategicPlan } from "../agents/planner.js";
import { listScripts } from "../scripts/index.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockClient = {} as LLMClient;
const mockIdentity = {} as IdentityContext;

const deps = {
  clientFactory: (_agentId: string) => mockClient,
  identity: mockIdentity,
  scriptsDir: "/tmp/scripts",
  plansDir: "/tmp/plans",
};

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    type: "execute_script",
    status: "running",
    goal: "do something",
    dependsOn: [],
    createdBy: "orchestrator",
    evidence: [],
    callbacks: [],
    channel: [],
    timestamps: { created: "2026-01-01T00:00:00Z" },
    ...overrides,
  };
}

const mockAdapter: IOAdapter = {
  sendResult: vi.fn().mockResolvedValue(undefined),
  sendError: vi.fn().mockResolvedValue(undefined),
  sendReviewBlock: vi.fn().mockResolvedValue(undefined),
  sendStatus: vi.fn().mockResolvedValue(undefined),
  sendAcknowledgment: vi.fn().mockResolvedValue(undefined),
  sendProgress: vi.fn().mockResolvedValue(undefined),
  onRequest: vi.fn(),
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  requestConfirmation: vi.fn().mockResolvedValue(true),
};

const mockPlan: Plan = {
  id: "plan-test",
  description: "test plan",
  steps: [{ description: "run script", scriptId: "list-files", order: 0 }],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listScripts).mockResolvedValue([]);
});

describe("DefaultJobExecutor", () => {
  // 1. execute_script
  it("execute_script job calls executeFromPlan with the job plan and returns the result", async () => {
    const expectedResult = { planId: "plan-test", results: [], instructionFile: { planId: "plan-test", steps: [] } };
    vi.mocked(executeFromPlan).mockResolvedValue(expectedResult);

    const executor = createDefaultJobExecutor(deps);
    const job = makeJob({ type: "execute_script", plan: mockPlan });

    const result = await executor.execute(job, undefined);

    expect(executeFromPlan).toHaveBeenCalledOnce();
    expect(executeFromPlan).toHaveBeenCalledWith(mockPlan, deps.scriptsDir, deps.plansDir);
    expect(result).toBe(expectedResult);
  });

  // 2. develop_script
  it("develop_script job calls generateScript with the job goal as capability and returns the result", async () => {
    const mockScripts = [{ id: "list-files", name: "list-files", description: "lists files", params: [], path: "/tmp/list-files.sh" }];
    vi.mocked(listScripts).mockResolvedValue(mockScripts);

    const dwResult = { scriptName: "my-script", scriptContent: "#!/bin/bash\n# @name my-script\n# @description does stuff\necho hi" };
    vi.mocked(generateScript).mockResolvedValue(dwResult);

    const executor = createDefaultJobExecutor(deps);
    const job = makeJob({ type: "develop_script", goal: "write a script that greets the user" });

    const result = await executor.execute(job, undefined);

    expect(listScripts).toHaveBeenCalledWith(deps.scriptsDir);
    expect(generateScript).toHaveBeenCalledOnce();
    expect(generateScript).toHaveBeenCalledWith(
      mockClient,
      { capability: job.goal, existingScripts: mockScripts },
      mockIdentity
    );
    expect(result).toBe(dwResult);
  });

  // 3. plan
  it("plan job calls createDetailedPlanWithDW with the job goal as a work assignment and returns the result", async () => {
    const lpResult = { plan: mockPlan, missingScripts: [] };
    vi.mocked(createDetailedPlanWithDW).mockResolvedValue(lpResult);

    const executor = createDefaultJobExecutor(deps);
    const job = makeJob({ type: "plan", goal: "write a detailed plan for the task" });

    const result = await executor.execute(job, undefined);

    expect(createDetailedPlanWithDW).toHaveBeenCalledOnce();
    expect(createDetailedPlanWithDW).toHaveBeenCalledWith(
      mockClient,
      { id: job.id, description: job.goal },
      mockIdentity,
      deps.scriptsDir,
      deps.plansDir,
      { adapter: undefined, skipReview: undefined }
    );
    expect(result).toBe(lpResult);
  });

  // 4. notify_user
  it("notify_user job calls adapter.sendResult with the job goal and returns a confirmation", async () => {
    const executor = createDefaultJobExecutor(deps);
    const job = makeJob({ type: "notify_user", goal: "Task is complete!" });

    const result = await executor.execute(job, mockAdapter);

    expect(mockAdapter.sendResult).toHaveBeenCalledOnce();
    expect(mockAdapter.sendResult).toHaveBeenCalledWith(job.goal, "");
    expect(result).toEqual({ notified: true, message: job.goal });
  });

  // 5. replan
  it("replan job calls createStrategicPlan with the job goal and returns the strategic plan", async () => {
    const strategicPlan = { id: "strategic-test", description: "strategic plan", assignments: [] };
    vi.mocked(createStrategicPlan).mockResolvedValue(strategicPlan);

    const executor = createDefaultJobExecutor(deps);
    const job = makeJob({ type: "replan", goal: "replan the overall strategy" });

    const result = await executor.execute(job, undefined);

    expect(createStrategicPlan).toHaveBeenCalledOnce();
    expect(createStrategicPlan).toHaveBeenCalledWith(
      mockClient,
      job.goal,
      mockIdentity,
      deps.plansDir
    );
    expect(result).toBe(strategicPlan);
  });

  // 6. initiative_setup
  it("initiative_setup throws a not-implemented error", async () => {
    const executor = createDefaultJobExecutor(deps);
    const job = makeJob({ type: "initiative_setup", goal: "set up the initiative" });

    await expect(executor.execute(job, undefined)).rejects.toThrow("not implemented");
  });

  // 7. unknown job type
  it("throws a descriptive error for unknown job types", async () => {
    const executor = createDefaultJobExecutor(deps);
    const job = makeJob({ type: "unknown_type" as Job["type"], goal: "do something weird" });

    await expect(executor.execute(job, undefined)).rejects.toThrow('Unknown job type: "unknown_type"');
  });
});
