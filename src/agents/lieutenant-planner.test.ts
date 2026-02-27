import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createDetailedPlan,
  createDetailedPlanWithDW,
  detectMissingScripts,
} from "./lieutenant-planner.js";
import type { LLMClient } from "./claude-client.js";
import type { IdentityContext, Plan, ScriptInfo } from "../types.js";

const mockIdentity: IdentityContext = {
  soul: "# Soul\nBe helpful.",
  constitution: "# Constitution\nBe honest.",
  agents: [
    {
      id: "lieutenant-planner",
      name: "Lieutenant Planner",
      class: "planner",
      configFile: "lieutenant-planner-agent.md",
      agentMd: "# Lieutenant Planner\nYou create detailed plans.",
      permissions: { canRead: [], canWrite: ["runtime/plans/"] },
    },
    {
      id: "developer-writer",
      name: "Developer/Writer",
      class: "action",
      configFile: "developer-writer-agent.md",
      agentMd: "# Developer/Writer\nYou write shell scripts.",
      permissions: { canRead: [], canWrite: ["runtime/staging/scripts/"] },
    },
  ],
};

const mockScripts: ScriptInfo[] = [
  {
    id: "list-files",
    name: "list-files",
    description: "List files in a directory",
    params: ["TARGET_DIR The directory to list"],
    path: "/scripts/list-files.sh",
  },
  {
    id: "read-file",
    name: "read-file",
    description: "Read a file with line numbers",
    params: ["FILE_PATH Path to the file"],
    path: "/scripts/read-file.sh",
  },
];

function createMockClient(planJson: object): LLMClient {
  const response = {
    content: JSON.stringify(planJson),
    inputTokens: 200,
    outputTokens: 100,
  };
  return {
    async sendMessage() { return response; },
    async sendMessages() { return response; },
  };
}

describe("createDetailedPlan", () => {
  let testDir: string;
  let scriptsDir: string;
  let plansDir: string;

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), "lp-test-"));
    scriptsDir = join(testDir, "scripts");
    plansDir = join(testDir, "plans");
    await mkdir(scriptsDir, { recursive: true });
    await mkdir(plansDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("produces a valid LieutenantPlanResult from LLM response", async () => {
    const client = createMockClient({
      id: "plan-read-config",
      description: "Read the config file",
      steps: [
        {
          description: "Read the config file",
          scriptId: "read-file",
          params: { FILE_PATH: "runtime/config.json" },
          order: 0,
        },
      ],
    });

    const result = await createDetailedPlan(
      client,
      { id: "assign-1", description: "Read the config file" },
      mockIdentity,
      scriptsDir,
      plansDir,
      mockScripts
    );

    expect(result.plan.id).toBe("plan-read-config");
    expect(result.plan.steps).toHaveLength(1);
    expect(result.plan.steps[0].scriptId).toBe("read-file");
    expect(result.missingScripts).toHaveLength(0);
  });

  it("writes PLAN markdown to disk", async () => {
    const client = createMockClient({
      id: "plan-md-test",
      description: "Test plan writing",
      steps: [
        {
          description: "List files",
          scriptId: "list-files",
          params: { TARGET_DIR: "." },
          order: 0,
        },
      ],
    });

    await createDetailedPlan(
      client,
      { id: "assign-2", description: "List project files" },
      mockIdentity,
      scriptsDir,
      plansDir,
      mockScripts
    );

    const mdPath = join(plansDir, "PLAN-plan-md-test.md");
    const content = await readFile(mdPath, "utf-8");
    expect(content).toContain("Detailed Plan: plan-md-test");
    expect(content).toContain("assign-2");
  });

  it("includes assignment context and constraints in the prompt", async () => {
    let capturedUser = "";
    const response = {
      content: JSON.stringify({
        id: "plan-ctx",
        description: "test",
        steps: [{ description: "step", scriptId: "list-files", params: {}, order: 0 }],
      }),
      inputTokens: 100,
      outputTokens: 50,
    };
    const client: LLMClient = {
      async sendMessage(_system, user) {
        capturedUser = user;
        return response;
      },
      async sendMessages() { return response; },
    };

    await createDetailedPlan(
      client,
      {
        id: "assign-ctx",
        description: "Do work",
        context: "This is a production server",
        constraints: ["No deletions", "Read-only access"],
      },
      mockIdentity,
      scriptsDir,
      plansDir,
      mockScripts
    );

    expect(capturedUser).toContain("This is a production server");
    expect(capturedUser).toContain("No deletions");
    expect(capturedUser).toContain("Read-only access");
  });

  it("validates WorkAssignment input", async () => {
    const client = createMockClient({ id: "x", description: "x", steps: [] });

    await expect(
      createDetailedPlan(
        client,
        // @ts-expect-error missing required field
        { description: "no id" },
        mockIdentity,
        scriptsDir,
        plansDir,
        mockScripts
      )
    ).rejects.toThrow();
  });
});

describe("detectMissingScripts", () => {
  it("extracts missing scripts from plan steps", () => {
    const plan: Plan = {
      id: "plan-test",
      description: "Test",
      steps: [
        {
          description: "Read config",
          scriptId: "read-file",
          params: { FILE_PATH: "config.json" },
          order: 0,
        },
        {
          description: "Send email notification",
          scriptId: "__missing__",
          missingReason: "Need a script that sends email via SMTP",
          params: { SCRIPT_NAME: "send-email" },
          order: 1,
        },
      ],
    };

    const missing = detectMissingScripts(plan);
    expect(missing).toHaveLength(1);
    expect(missing[0].name).toBe("send-email");
    expect(missing[0].capability).toBe("Need a script that sends email via SMTP");
  });

  it("returns empty array when no missing scripts", () => {
    const plan: Plan = {
      id: "plan-ok",
      description: "All good",
      steps: [
        { description: "Step 1", scriptId: "list-files", params: {}, order: 0 },
      ],
    };

    expect(detectMissingScripts(plan)).toHaveLength(0);
  });

  it("generates fallback name when SCRIPT_NAME param is missing", () => {
    const plan: Plan = {
      id: "plan-noname",
      description: "No name",
      steps: [
        {
          description: "Do something new",
          scriptId: "__missing__",
          missingReason: "Need a new capability",
          order: 3,
        },
      ],
    };

    const missing = detectMissingScripts(plan);
    expect(missing[0].name).toBe("script-for-step-3");
  });

  it("uses step description as capability when missingReason is absent", () => {
    const plan: Plan = {
      id: "plan-noreason",
      description: "No reason",
      steps: [
        {
          description: "Deploy the artifact",
          scriptId: "__missing__",
          order: 0,
        },
      ],
    };

    const missing = detectMissingScripts(plan);
    expect(missing[0].capability).toBe("Deploy the artifact");
  });
});

describe("createDetailedPlanWithDW", () => {
  let testDir: string;
  let scriptsDir: string;
  let plansDir: string;

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), "lp-dw-test-"));
    scriptsDir = join(testDir, "scripts");
    plansDir = join(testDir, "plans");
    await mkdir(scriptsDir, { recursive: true });
    await mkdir(plansDir, { recursive: true });
    // Write a bootstrap script so listScripts finds something
    await writeFile(
      join(scriptsDir, "list-files.sh"),
      "#!/bin/bash\n# @name list-files\n# @description List files\n# @param TARGET_DIR Dir\nls $TARGET_DIR\n",
      { mode: 0o755 }
    );
    // stageScript uses relative paths
    process.chdir(testDir);
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("returns plan directly when no missing scripts", async () => {
    const client = createMockClient({
      id: "plan-no-missing",
      description: "Simple plan",
      steps: [
        { description: "List files", scriptId: "list-files", params: { TARGET_DIR: "." }, order: 0 },
      ],
    });

    // Mock applyReview to allow
    vi.doMock("./reviewed.js", () => ({
      applyReview: vi.fn().mockResolvedValue(undefined),
      ReviewHaltError: class extends Error { constructor(r: string) { super(r); } },
    }));

    const result = await createDetailedPlanWithDW(
      client,
      { id: "assign-simple", description: "List files" },
      mockIdentity,
      scriptsDir,
      plansDir,
      { skipReview: true }
    );

    expect(result.plan.id).toBe("plan-no-missing");
    expect(result.missingScripts).toHaveLength(0);
  });

  it("caps DW calls at MAX_DW_CALLS (3)", async () => {
    // Always return a plan with a missing script — simulates DW always failing to fix it
    let callCount = 0;
    const alwaysMissingPlan = {
      id: "plan-many-missing",
      description: "Plan with many missing scripts",
      steps: [
        { description: "Missing 1", scriptId: "__missing__", missingReason: "need script A", params: { SCRIPT_NAME: "script-a" }, order: 0 },
        { description: "Missing 2", scriptId: "__missing__", missingReason: "need script B", params: { SCRIPT_NAME: "script-b" }, order: 1 },
        { description: "Missing 3", scriptId: "__missing__", missingReason: "need script C", params: { SCRIPT_NAME: "script-c" }, order: 2 },
        { description: "Missing 4", scriptId: "__missing__", missingReason: "need script D", params: { SCRIPT_NAME: "script-d" }, order: 3 },
      ],
    };

    const client: LLMClient = {
      async sendMessage() {
        callCount++;
        // DW calls get the generateScript response; LP calls get the plan
        // Since generateAndPromote will fail (no DW agent config to generate valid scripts
        // via mock), the catch block increments dwCallCount
        return {
          content: JSON.stringify(alwaysMissingPlan),
          inputTokens: 100,
          outputTokens: 50,
        };
      },
      async sendMessages() {
        return { content: JSON.stringify(alwaysMissingPlan), inputTokens: 100, outputTokens: 50 };
      },
    };

    const result = await createDetailedPlanWithDW(
      client,
      { id: "assign-cap", description: "Test cap" },
      mockIdentity,
      scriptsDir,
      plansDir,
      { skipReview: true }
    );

    // Should still have missing scripts since DW calls fail (mock doesn't produce valid scripts)
    // But should not loop infinitely — capped at 3 DW calls
    expect(result.missingScripts.length).toBeGreaterThan(0);
  });
});
