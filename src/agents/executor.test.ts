import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeFromPlan } from "./executor.js";
import type { Plan } from "../types.js";

describe("executeFromPlan", () => {
  let scriptsDir: string;
  let plansDir: string;

  beforeAll(async () => {
    const testDir = await mkdtemp(join(tmpdir(), "domesticlaw-executor-"));
    scriptsDir = join(testDir, "scripts");
    plansDir = join(testDir, "plans");
    await mkdir(scriptsDir, { recursive: true });
    await mkdir(plansDir, { recursive: true });

    await writeFile(
      join(scriptsDir, "echo-msg.sh"),
      [
        "#!/bin/bash",
        "# @name echo-msg",
        "# @description Echo a message",
        "# @param MSG The message",
        'echo "$MSG"',
      ].join("\n"),
      { mode: 0o755 }
    );

    await writeFile(
      join(scriptsDir, "list-dir.sh"),
      [
        "#!/bin/bash",
        "# @name list-dir",
        "# @description List a directory",
        "# @param TARGET_DIR The directory",
        'ls "$TARGET_DIR"',
      ].join("\n"),
      { mode: 0o755 }
    );
  });

  afterAll(async () => {
    // Clean up the parent temp dir
    const testDir = join(scriptsDir, "..");
    await rm(testDir, { recursive: true });
  });

  it("executes plan steps referencing available scripts", async () => {
    const plan: Plan = {
      id: "test-plan-001",
      description: "Echo a test message",
      steps: [
        {
          description: "Echo hello",
          scriptId: "echo-msg",
          params: { MSG: "hello from executor" },
          order: 0,
        },
      ],
    };

    const result = await executeFromPlan(plan, scriptsDir, plansDir);
    expect(result.planId).toBe("test-plan-001");
    expect(result.results).toHaveLength(1);
    expect(result.results[0].stdout).toBe("hello from executor");
  });

  it("writes instruction JSON to disk", async () => {
    const plan: Plan = {
      id: "test-plan-002",
      description: "Test instruction output",
      steps: [
        {
          description: "Echo test",
          scriptId: "echo-msg",
          params: { MSG: "test" },
          order: 0,
        },
      ],
    };

    await executeFromPlan(plan, scriptsDir, plansDir);
    const instructionPath = join(plansDir, "test-plan-002-instructions.json");
    const content = await readFile(instructionPath, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.planId).toBe("test-plan-002");
    expect(parsed.steps).toHaveLength(1);
  });

  it("skips steps referencing unknown scripts", async () => {
    const plan: Plan = {
      id: "test-plan-003",
      description: "Mixed valid and invalid",
      steps: [
        {
          description: "Valid step",
          scriptId: "echo-msg",
          params: { MSG: "valid" },
          order: 0,
        },
        {
          description: "Invalid step",
          scriptId: "nonexistent-script",
          params: {},
          order: 1,
        },
      ],
    };

    const result = await executeFromPlan(plan, scriptsDir, plansDir);
    // Only the valid step should be in instructions
    expect(result.instructionFile.steps).toHaveLength(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].stdout).toBe("valid");
  });

  it("throws ZodError for malformed plan", async () => {
    const bad = { id: 123, description: null, steps: "not-array" } as unknown;
    await expect(executeFromPlan(bad as Plan, scriptsDir, plansDir)).rejects.toThrow();
  });

  it("executes multi-step plans in order", async () => {
    const plan: Plan = {
      id: "test-plan-004",
      description: "Multi-step",
      steps: [
        {
          description: "First",
          scriptId: "echo-msg",
          params: { MSG: "step-1" },
          order: 0,
        },
        {
          description: "Second",
          scriptId: "echo-msg",
          params: { MSG: "step-2" },
          order: 1,
        },
      ],
    };

    const result = await executeFromPlan(plan, scriptsDir, plansDir);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].stdout).toBe("step-1");
    expect(result.results[1].stdout).toBe("step-2");
  });
});
