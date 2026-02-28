import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createJobStore, type JobStore } from "./store.js";

let testDir: string;
let store: JobStore;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "writ-jobs-"));
  store = await createJobStore(testDir);
});

afterAll(async () => {
  // Clean up last test dir (others may have been cleaned by previous test runs)
  if (testDir) await rm(testDir, { recursive: true }).catch(() => {});
});

function makeJobPartial(overrides: Record<string, unknown> = {}) {
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

describe("createJob", () => {
  it("creates a job with monotonic ID", async () => {
    const job1 = await store.createJob(makeJobPartial());
    const job2 = await store.createJob(makeJobPartial());
    expect(job1.id).toBe("job-1");
    expect(job2.id).toBe("job-2");
  });

  it("sets status to pending and timestamps.created", async () => {
    const job = await store.createJob(makeJobPartial());
    expect(job.status).toBe("pending");
    expect(job.timestamps.created).toBeDefined();
  });

  it("rejects cycles (dependency ID >= new job ID)", async () => {
    await expect(
      store.createJob(makeJobPartial({ dependsOn: ["job-99"] }))
    ).rejects.toThrow("Cycle prevention");
  });
});

describe("getJob", () => {
  it("returns job by ID", async () => {
    const job = await store.createJob(makeJobPartial());
    const fetched = await store.getJob(job.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(job.id);
  });

  it("returns null for nonexistent ID", async () => {
    expect(await store.getJob("job-999")).toBeNull();
  });
});

describe("updateJob", () => {
  it("updates job fields", async () => {
    const job = await store.createJob(makeJobPartial());
    const updated = await store.updateJob(job.id, {
      status: "running",
      timestamps: { ...job.timestamps, started: "2026-02-25T10:00:00" },
    });
    expect(updated.status).toBe("running");
    expect(updated.timestamps.started).toBeDefined();
  });

  it("throws for nonexistent job", async () => {
    await expect(store.updateJob("job-999", {})).rejects.toThrow("not found");
  });
});

describe("getReady", () => {
  it("returns pending jobs with no dependencies", async () => {
    await store.createJob(makeJobPartial());
    const ready = await store.getReady();
    expect(ready).toHaveLength(1);
  });

  it("returns pending jobs with all dependencies completed", async () => {
    const dep = await store.createJob(makeJobPartial());
    await store.updateJob(dep.id, { status: "completed" });

    await store.createJob(makeJobPartial({ dependsOn: [dep.id] }));
    const ready = await store.getReady();
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe("job-2");
  });

  it("does not return jobs with incomplete dependencies", async () => {
    const dep = await store.createJob(makeJobPartial());
    await store.createJob(makeJobPartial({ dependsOn: [dep.id] }));
    const ready = await store.getReady();
    // Only job-1 is ready (no deps), job-2 is blocked
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe("job-1");
  });
});

describe("getRunning", () => {
  it("returns only running jobs", async () => {
    const job = await store.createJob(makeJobPartial());
    await store.updateJob(job.id, { status: "running" });
    await store.createJob(makeJobPartial());

    const running = await store.getRunning();
    expect(running).toHaveLength(1);
    expect(running[0].id).toBe(job.id);
  });
});

describe("persistence", () => {
  it("survives store recreation (round-trip)", async () => {
    await store.createJob(makeJobPartial({ goal: "Persist this" }));
    await store.createJob(makeJobPartial({ goal: "And this" }));

    // Create a fresh store from same directory
    const store2 = await createJobStore(testDir);
    const all = await store2.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((j) => j.goal).sort()).toEqual(["And this", "Persist this"]);
  });

  it("continues monotonic IDs after recreation", async () => {
    await store.createJob(makeJobPartial());
    await store.createJob(makeJobPartial());

    const store2 = await createJobStore(testDir);
    const job3 = await store2.createJob(makeJobPartial());
    expect(job3.id).toBe("job-3");
  });
});
