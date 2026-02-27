import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createJobStore, type JobStore } from "./store.js";
import { createScheduler, type JobExecutor, type Scheduler } from "./scheduler.js";
import type { Job } from "./types.js";

let testDir: string;
let store: JobStore;
let scheduler: Scheduler;

function makePartial(overrides: Record<string, unknown> = {}) {
  return {
    type: "execute_script" as const,
    goal: "Test goal",
    dependsOn: [] as string[],
    createdBy: "orchestrator",
    evidence: [],
    callbacks: [],
    channel: ["cli"],
    ...overrides,
  };
}

describe("scheduler", () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "domesticlaw-sched-"));
    store = await createJobStore(testDir);
  });

  afterAll(async () => {
    if (testDir) await rm(testDir, { recursive: true }).catch(() => {});
  });

  it("executes a single job", async () => {
    let executed = false;
    const executor: JobExecutor = {
      async execute() { executed = true; return "done"; },
    };
    scheduler = createScheduler(store, executor, undefined, { tickIntervalMs: 10 });

    await scheduler.submitJob(makePartial());
    await scheduler.run();

    expect(executed).toBe(true);
    const jobs = await store.getAll();
    expect(jobs[0].status).toBe("completed");
    expect(jobs[0].result).toBe("done");
  });

  it("executes dependency chain A → B → C", async () => {
    const order: string[] = [];
    const executor: JobExecutor = {
      async execute(job: Job) { order.push(job.goal); return job.goal; },
    };
    scheduler = createScheduler(store, executor, undefined, { tickIntervalMs: 10 });

    const a = await scheduler.submitJob(makePartial({ goal: "A" }));
    const b = await scheduler.submitJob(makePartial({ goal: "B", dependsOn: [a.id] }));
    await scheduler.submitJob(makePartial({ goal: "C", dependsOn: [b.id] }));

    await scheduler.run();

    expect(order).toEqual(["A", "B", "C"]);
    const jobs = await store.getAll();
    expect(jobs.every((j) => j.status === "completed")).toBe(true);
  });

  it("runs independent jobs in parallel", async () => {
    const started: string[] = [];
    const executor: JobExecutor = {
      async execute(job: Job) {
        started.push(job.goal);
        await new Promise((r) => setTimeout(r, 10));
        return job.goal;
      },
    };
    scheduler = createScheduler(store, executor, undefined, { tickIntervalMs: 10 });

    await scheduler.submitJob(makePartial({ goal: "A" }));
    await scheduler.submitJob(makePartial({ goal: "B" }));

    await scheduler.run();

    // Both should have been started (not necessarily in order, but both present)
    expect(started).toContain("A");
    expect(started).toContain("B");
  });

  it("enforces concurrency limit", async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;
    const executor: JobExecutor = {
      async execute() {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((r) => setTimeout(r, 50));
        currentConcurrent--;
        return "done";
      },
    };
    scheduler = createScheduler(store, executor, undefined, { concurrencyLimit: 2, tickIntervalMs: 10 });

    // Submit 4 jobs
    for (let i = 0; i < 4; i++) {
      await scheduler.submitJob(makePartial({ goal: `Job ${i}` }));
    }

    await scheduler.run();

    expect(maxConcurrent).toBeLessThanOrEqual(2);
    const jobs = await store.getAll();
    expect(jobs.every((j) => j.status === "completed")).toBe(true);
  });

  it("processes callbacks (create_job)", async () => {
    const executor: JobExecutor = {
      async execute(job: Job) { return `completed: ${job.goal}`; },
    };
    scheduler = createScheduler(store, executor, undefined, { tickIntervalMs: 10 });

    await scheduler.submitJob(makePartial({
      goal: "Parent",
      callbacks: [{
        on: "complete",
        action: "create_job",
        payload: { type: "notify_user", goal: "Notify about parent completion" },
      }],
    }));

    await scheduler.run();

    const jobs = await store.getAll();
    expect(jobs).toHaveLength(2);
    expect(jobs[1].goal).toBe("Notify about parent completion");
    expect(jobs[1].type).toBe("notify_user");
    expect(jobs[1].status).toBe("completed");
  });

  it("handles job failure", async () => {
    const executor: JobExecutor = {
      async execute() { throw new Error("Job exploded"); },
    };
    scheduler = createScheduler(store, executor, undefined, { tickIntervalMs: 10 });

    await scheduler.submitJob(makePartial());
    await scheduler.run();

    const jobs = await store.getAll();
    expect(jobs[0].status).toBe("failed");
    expect((jobs[0].result as Record<string, unknown>).error).toBe("Job exploded");
  });

  it("waitForJob resolves when job completes", async () => {
    const executor: JobExecutor = {
      async execute() {
        await new Promise((r) => setTimeout(r, 20));
        return "waited-result";
      },
    };
    scheduler = createScheduler(store, executor, undefined, { tickIntervalMs: 10 });

    const job = await scheduler.submitJob(makePartial());

    // Start scheduler in background
    const runPromise = scheduler.run();
    const result = await scheduler.waitForJob(job.id, 5000);
    await runPromise;

    expect(result.status).toBe("completed");
    expect(result.result).toBe("waited-result");
  });
});
