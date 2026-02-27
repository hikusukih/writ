import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPlan, createStrategicPlan } from "./planner.js";
import type { LLMClient } from "./claude-client.js";
import type { IdentityContext, ScriptInfo } from "../types.js";

const mockIdentity: IdentityContext = {
  soul: "# Soul\nBe helpful.",
  constitution: "# Constitution\nBe honest.",
  agents: [
    {
      id: "planner",
      name: "General Planner",
      class: "planner",
      configFile: "planner-agent.md",
      agentMd: "# Planner\nYou create plans.",
      permissions: { canRead: [], canWrite: ["runtime/plans/"] },
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
  const response = { content: JSON.stringify(planJson), inputTokens: 200, outputTokens: 100 };
  return {
    async sendMessage(_system: string, _user: string) { return response; },
    async sendMessages(_system: string, _messages: unknown[]) { return response; },
  };
}

describe("createPlan", () => {
  let testDir: string;
  let scriptsDir: string;
  let plansDir: string;

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), "domesticlaw-planner-"));
    scriptsDir = join(testDir, "scripts");
    plansDir = join(testDir, "plans");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(scriptsDir, { recursive: true });
    await mkdir(plansDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true });
  });

  it("produces a valid Plan from Claude response", async () => {
    const client = createMockClient({
      id: "plan-list-cwd",
      description: "List files in current directory",
      steps: [
        {
          description: "List the current directory",
          scriptId: "list-files",
          params: { TARGET_DIR: "." },
          order: 0,
        },
      ],
    });

    const plan = await createPlan(
      client,
      "list files in the current directory",
      mockIdentity,
      scriptsDir,
      plansDir,
      mockScripts
    );

    expect(plan.id).toBe("plan-list-cwd");
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].scriptId).toBe("list-files");
  });

  it("writes PLANXYZ.md to disk", async () => {
    const client = createMockClient({
      id: "plan-write-test",
      description: "Test plan writing",
      steps: [
        {
          description: "Read a file",
          scriptId: "read-file",
          params: { FILE_PATH: "/tmp/test.txt" },
          order: 0,
        },
      ],
    });

    await createPlan(
      client,
      "read a file",
      mockIdentity,
      scriptsDir,
      plansDir,
      mockScripts
    );

    const mdPath = join(plansDir, "PLAN-plan-write-test.md");
    const content = await readFile(mdPath, "utf-8");
    expect(content).toContain("Plan: plan-write-test");
    expect(content).toContain("read-file");
  });

  it("handles Claude response wrapped in markdown fences", async () => {
    const fencedResponse = {
      content:
        '```json\n{"id":"plan-fenced","description":"test","steps":[{"description":"echo","scriptId":"list-files","params":{},"order":0}]}\n```',
      inputTokens: 100,
      outputTokens: 50,
    };
    const client: LLMClient = {
      async sendMessage(_system: string, _user: string) { return fencedResponse; },
      async sendMessages(_system: string, _messages: unknown[]) { return fencedResponse; },
    };

    const plan = await createPlan(
      client,
      "test task",
      mockIdentity,
      scriptsDir,
      plansDir,
      mockScripts
    );
    expect(plan.id).toBe("plan-fenced");
  });

  it("passes available scripts in the prompt", async () => {
    let capturedUser = "";
    const checkResponse = {
      content:
        '{"id":"plan-check","description":"test","steps":[{"description":"step","scriptId":"list-files","params":{},"order":0}]}',
      inputTokens: 100,
      outputTokens: 50,
    };
    const client: LLMClient = {
      async sendMessage(_system: string, user: string) {
        capturedUser = user;
        return checkResponse;
      },
      async sendMessages(_system: string, _messages: unknown[]) { return checkResponse; },
    };

    await createPlan(
      client,
      "test task",
      mockIdentity,
      scriptsDir,
      plansDir,
      mockScripts
    );

    expect(capturedUser).toContain("list-files");
    expect(capturedUser).toContain("List files in a directory");
    expect(capturedUser).toContain("read-file");
  });
});

describe("createStrategicPlan", () => {
  let testDir: string;
  let plansDir: string;

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), "domesticlaw-strategic-"));
    plansDir = join(testDir, "plans");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(plansDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true });
  });

  it("produces a valid StrategicPlan with assignments", async () => {
    const client = createMockClient({
      id: "strategic-deploy",
      description: "Deploy the application",
      assignments: [
        { id: "assign-1", description: "Build the project" },
        { id: "assign-2", description: "Run tests", constraints: ["All tests must pass"] },
        { id: "assign-3", description: "Deploy to staging", context: "After build and tests" },
      ],
    });

    const plan = await createStrategicPlan(
      client,
      "deploy the application",
      mockIdentity,
      plansDir
    );

    expect(plan.id).toBe("strategic-deploy");
    expect(plan.assignments).toHaveLength(3);
    expect(plan.assignments[0].id).toBe("assign-1");
    expect(plan.assignments[1].constraints).toContain("All tests must pass");
    expect(plan.assignments[2].context).toBe("After build and tests");
  });

  it("writes STRATEGIC markdown to disk", async () => {
    const client = createMockClient({
      id: "strategic-md-test",
      description: "Test writing",
      assignments: [
        { id: "assign-1", description: "Do the thing" },
      ],
    });

    await createStrategicPlan(client, "test", mockIdentity, plansDir);

    const mdPath = join(plansDir, "STRATEGIC-strategic-md-test.md");
    const content = await readFile(mdPath, "utf-8");
    expect(content).toContain("Strategic Plan: strategic-md-test");
    expect(content).toContain("assign-1");
    expect(content).toContain("Do the thing");
  });

  it("does not include script references in the prompt", async () => {
    let capturedUser = "";
    const response = {
      content: JSON.stringify({
        id: "strategic-noscripts",
        description: "test",
        assignments: [{ id: "assign-1", description: "work" }],
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

    await createStrategicPlan(client, "test task", mockIdentity, plansDir);

    // Strategic planner should NOT reference specific scripts
    expect(capturedUser).not.toContain("scriptId");
    expect(capturedUser).toContain("assignments");
  });

  it("handles a single-assignment simple task", async () => {
    const client = createMockClient({
      id: "strategic-simple",
      description: "List files",
      assignments: [
        { id: "assign-1", description: "List the project files" },
      ],
    });

    const plan = await createStrategicPlan(client, "list files", mockIdentity, plansDir);
    expect(plan.assignments).toHaveLength(1);
  });
});
