import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleRequest, buildInterpretPrompt, buildResponsePrompt, buildSideEffectSummary } from "./orchestrator.js";
import { ReviewHaltError } from "./reviewed.js";
import type { LLMClient, MessageParam } from "./claude-client.js";
import type { ExecutionResult, IdentityContext } from "../types.js";

const mockIdentity: IdentityContext = {
  soul: "# Soul\nBe helpful.",
  constitution: "# Constitution\nBe honest.",
  agents: [
    {
      id: "orchestrator",
      name: "Orchestrator",
      class: "os",
      configFile: "orchestrator-agent.md",
      agentMd: "# Orchestrator\nYou coordinate agents.",
      permissions: { canRead: [], canWrite: [] },
    },
    {
      id: "planner",
      name: "General Planner",
      class: "planner",
      configFile: "planner-agent.md",
      agentMd: "# Planner\nYou create strategic plans.",
      permissions: { canRead: [], canWrite: ["runtime/plans/"] },
    },
    {
      id: "lieutenant-planner",
      name: "Lieutenant Planner",
      class: "planner",
      configFile: "lieutenant-planner-agent.md",
      agentMd: "# Lieutenant Planner\nYou create detailed plans.",
      permissions: { canRead: [], canWrite: ["runtime/plans/"] },
    },
  ],
};

// Helper: strategic plan with one assignment
function strategicPlanJson(slug: string, desc: string) {
  return {
    id: `strategic-${slug}`,
    description: desc,
    assignments: [{ id: "assign-1", description: desc }],
  };
}

// Helper: detailed plan with one step
function detailedPlanJson(slug: string, desc: string, scriptId: string, params: Record<string, string>) {
  return {
    id: `plan-${slug}`,
    description: desc,
    steps: [{ description: desc, scriptId, params, order: 0 }],
  };
}

describe("handleRequest", () => {
  let scriptsDir: string;
  let plansDir: string;

  beforeAll(async () => {
    const testDir = await mkdtemp(join(tmpdir(), "domesticlaw-orch-"));
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
  });

  afterAll(async () => {
    const testDir = join(scriptsDir, "..");
    await rm(testDir, { recursive: true });
  });

  // With skipReview and the new pipeline, LLM calls are:
  // 1: orchestrator interpret
  // 2: general planner → strategic plan
  // 3: lieutenant planner → detailed plan
  // 4: response generator
  it("runs the full GP → LP → Executor chain", async () => {
    let callCount = 0;
    const mockResponse = (count: number) => {
      if (count === 1) {
        return { content: "Echo a greeting message", inputTokens: 100, outputTokens: 20 };
      }
      if (count === 2) {
        return {
          content: JSON.stringify(strategicPlanJson("greet", "Echo a greeting")),
          inputTokens: 200, outputTokens: 100,
        };
      }
      if (count === 3) {
        return {
          content: JSON.stringify(detailedPlanJson("greet", "Echo hello", "echo-msg", { MSG: "Hello from DomestiClaw!" })),
          inputTokens: 200, outputTokens: 100,
        };
      }
      // Call 4: response summarizer
      return { content: "I echoed the message 'Hello from DomestiClaw!' successfully.", inputTokens: 100, outputTokens: 20 };
    };
    const client: LLMClient = {
      async sendMessage() { callCount++; return mockResponse(callCount); },
      async sendMessages() { callCount++; return mockResponse(callCount); },
    };

    const result = await handleRequest(
      client, "say hello", mockIdentity, scriptsDir, plansDir, undefined, true
    );

    expect(result.response).toContain("Hello from DomestiClaw!");
    expect(result.provenance.length).toBeGreaterThanOrEqual(4);
    expect(result.provenance[0].agentId).toBe("orchestrator");
    expect(result.provenance[1].agentId).toBe("planner");
    expect(result.provenance[2].agentId).toBe("lieutenant-planner");
    expect(result.provenance[3].agentId).toBe("executor");
  });

  it("tracks provenance through the chain", async () => {
    let callCount = 0;
    const mockResponse = (count: number) => {
      if (count === 1) return { content: "List available scripts", inputTokens: 50, outputTokens: 10 };
      if (count === 2) return { content: JSON.stringify(strategicPlanJson("list", "List scripts")), inputTokens: 100, outputTokens: 50 };
      if (count === 3) return {
        content: JSON.stringify(detailedPlanJson("list", "Echo available", "echo-msg", { MSG: "scripts listed" })),
        inputTokens: 100, outputTokens: 50,
      };
      return { content: "Done.", inputTokens: 50, outputTokens: 5 };
    };
    const client: LLMClient = {
      async sendMessage() { callCount++; return mockResponse(callCount); },
      async sendMessages() { callCount++; return mockResponse(callCount); },
    };

    const result = await handleRequest(
      client, "what scripts do you have?", mockIdentity, scriptsDir, plansDir, undefined, true
    );

    expect(result.provenance[0].action).toBe("interpreted user request");
    expect(result.provenance[1].action).toContain("created strategic plan");
    expect(result.provenance[2].action).toContain("created detailed plan");
    expect(result.provenance[3].action).toContain("executed plan");
  });

  it("passes conversation history to sendMessages when provided", async () => {
    let capturedMessages: MessageParam[] = [];
    let sendMessageCount = 0;
    const client: LLMClient = {
      async sendMessage() {
        sendMessageCount++;
        if (sendMessageCount === 1) {
          // Strategic plan
          return { content: JSON.stringify(strategicPlanJson("hist", "History test")), inputTokens: 100, outputTokens: 50 };
        }
        if (sendMessageCount === 2) {
          // Detailed plan
          return {
            content: JSON.stringify(detailedPlanJson("hist", "Echo", "echo-msg", { MSG: "ok" })),
            inputTokens: 100, outputTokens: 50,
          };
        }
        return { content: "Done.", inputTokens: 50, outputTokens: 5 };
      },
      async sendMessages(_system: string, messages: MessageParam[]) {
        capturedMessages = messages;
        return { content: "Show the first script from before", inputTokens: 100, outputTokens: 20 };
      },
    };

    const history: MessageParam[] = [
      { role: "user", content: buildInterpretPrompt("list files in scripts/") },
      { role: "assistant", content: "Found: echo-msg.sh" },
    ];

    await handleRequest(
      client, "show me the first one", mockIdentity, scriptsDir, plansDir, history, true
    );

    expect(capturedMessages.length).toBe(3);
    expect(capturedMessages[0].role).toBe("user");
    expect(capturedMessages[0].content).toContain("list files in scripts/");
    expect(capturedMessages[1]).toEqual({ role: "assistant", content: "Found: echo-msg.sh" });
    expect(capturedMessages[2].role).toBe("user");
    expect(capturedMessages[2].content).toContain("show me the first one");
  });

  it("uses sendMessage when no history is provided", async () => {
    let usedSendMessage = false;
    let usedSendMessages = false;
    let callCount = 0;
    const client: LLMClient = {
      async sendMessage() {
        callCount++;
        usedSendMessage = true;
        if (callCount === 1) return { content: "Task description", inputTokens: 50, outputTokens: 10 };
        if (callCount === 2) return { content: JSON.stringify(strategicPlanJson("nomsg", "Test")), inputTokens: 100, outputTokens: 50 };
        if (callCount === 3) return {
          content: JSON.stringify(detailedPlanJson("nomsg", "Echo", "echo-msg", { MSG: "ok" })),
          inputTokens: 100, outputTokens: 50,
        };
        return { content: "Done.", inputTokens: 50, outputTokens: 5 };
      },
      async sendMessages() { usedSendMessages = true; return { content: "should not be called", inputTokens: 0, outputTokens: 0 }; },
    };

    await handleRequest(client, "hello", mockIdentity, scriptsDir, plansDir, undefined, true);
    expect(usedSendMessage).toBe(true);
    expect(usedSendMessages).toBe(false);
  });

  it("includes sideEffects in result when scripts ran", async () => {
    let callCount = 0;
    const client: LLMClient = {
      async sendMessage() {
        callCount++;
        if (callCount === 1) return { content: "Echo a message", inputTokens: 50, outputTokens: 10 };
        if (callCount === 2) return { content: JSON.stringify(strategicPlanJson("se", "Side effects test")), inputTokens: 100, outputTokens: 50 };
        if (callCount === 3) return {
          content: JSON.stringify(detailedPlanJson("se", "Echo", "echo-msg", { MSG: "hello" })),
          inputTokens: 100, outputTokens: 50,
        };
        return { content: "Done.", inputTokens: 50, outputTokens: 5 };
      },
      async sendMessages() { return { content: "should not be called", inputTokens: 0, outputTokens: 0 }; },
    };

    const result = await handleRequest(client, "echo hello", mockIdentity, scriptsDir, plansDir, undefined, true);
    expect(result.sideEffects).toBeDefined();
    expect(result.sideEffects).toContain("echo-msg");
    expect(result.sideEffects).toContain("MSG=hello");
  });

  it("throws ReviewHaltError when orchestrator response contains dangerous content", async () => {
    // With LLM review enabled, call sequence:
    // 1: interpret
    // 2: reviewWithLLM of interpretation → allow
    // 3: strategic plan
    // 4: detailed plan (LP)
    // 5: reviewWithLLM of LP plan → allow
    // 6: response generator → dangerous content
    // 7: reviewWithLLM of response → non-JSON → fallback detects sudo
    const allowJson = '{"decision":"allow","reasoning":"Safe."}';
    let callCount = 0;
    const client: LLMClient = {
      async sendMessage() {
        callCount++;
        if (callCount === 1) return { content: "Echo a message", inputTokens: 50, outputTokens: 10 };
        if (callCount === 2) return { content: allowJson, inputTokens: 10, outputTokens: 5 };
        if (callCount === 3) return { content: JSON.stringify(strategicPlanJson("danger", "Test")), inputTokens: 100, outputTokens: 50 };
        if (callCount === 4) return {
          content: JSON.stringify(detailedPlanJson("danger", "Echo", "echo-msg", { MSG: "test" })),
          inputTokens: 100, outputTokens: 50,
        };
        if (callCount === 5) return { content: allowJson, inputTokens: 10, outputTokens: 5 };
        if (callCount === 6) return { content: "Run sudo rm -rf / to clean up.", inputTokens: 50, outputTokens: 5 };
        // Call 7: review of final response → invalid JSON → fallback rule-based detects sudo
        return { content: "not-json", inputTokens: 5, outputTokens: 2 };
      },
      async sendMessages() { return { content: "should not be called", inputTokens: 0, outputTokens: 0 }; },
    };

    await expect(
      handleRequest(client, "do something", mockIdentity, scriptsDir, plansDir)
    ).rejects.toThrow(ReviewHaltError);
  });

  it("skips review when skipReview is true", async () => {
    let callCount = 0;
    const client: LLMClient = {
      async sendMessage() {
        callCount++;
        if (callCount === 1) return { content: "Echo a message", inputTokens: 50, outputTokens: 10 };
        if (callCount === 2) return { content: JSON.stringify(strategicPlanJson("skip", "Skip review test")), inputTokens: 100, outputTokens: 50 };
        if (callCount === 3) return {
          content: JSON.stringify(detailedPlanJson("skip", "Echo", "echo-msg", { MSG: "test" })),
          inputTokens: 100, outputTokens: 50,
        };
        return { content: "Run sudo rm -rf / to clean up.", inputTokens: 50, outputTokens: 5 };
      },
      async sendMessages() { return { content: "should not be called", inputTokens: 0, outputTokens: 0 }; },
    };

    const result = await handleRequest(
      client, "do something", mockIdentity, scriptsDir, plansDir, undefined, true
    );
    expect(result.response).toContain("sudo");
  });

  it("handles multi-assignment strategic plans", async () => {
    let callCount = 0;
    const multiAssignmentPlan = {
      id: "strategic-multi",
      description: "Multi-step operation",
      assignments: [
        { id: "assign-1", description: "First task" },
        { id: "assign-2", description: "Second task" },
      ],
    };
    const client: LLMClient = {
      async sendMessage() {
        callCount++;
        if (callCount === 1) return { content: "Do two things", inputTokens: 50, outputTokens: 10 };
        if (callCount === 2) return { content: JSON.stringify(multiAssignmentPlan), inputTokens: 200, outputTokens: 100 };
        if (callCount === 3) return {
          content: JSON.stringify(detailedPlanJson("first", "Echo first", "echo-msg", { MSG: "first" })),
          inputTokens: 100, outputTokens: 50,
        };
        if (callCount === 4) return {
          content: JSON.stringify(detailedPlanJson("second", "Echo second", "echo-msg", { MSG: "second" })),
          inputTokens: 100, outputTokens: 50,
        };
        return { content: "Both tasks completed.", inputTokens: 50, outputTokens: 10 };
      },
      async sendMessages() { return { content: "should not be called", inputTokens: 0, outputTokens: 0 }; },
    };

    const result = await handleRequest(
      client, "do two things", mockIdentity, scriptsDir, plansDir, undefined, true
    );

    expect(result.response).toContain("Both tasks completed");
    // orchestrator + planner + 2*(LP + executor) = 6 provenance entries
    expect(result.provenance.length).toBe(6);
    expect(result.provenance.filter((p) => p.agentId === "lieutenant-planner")).toHaveLength(2);
    expect(result.provenance.filter((p) => p.agentId === "executor")).toHaveLength(2);
  });
});

describe("buildSideEffectSummary", () => {
  it("returns empty string when no results", () => {
    const execResult: ExecutionResult = {
      planId: "plan-1",
      results: [],
      instructionFile: { planId: "plan-1", steps: [] },
    };
    expect(buildSideEffectSummary([execResult])).toBe("");
  });

  it("returns empty string for empty array", () => {
    expect(buildSideEffectSummary([])).toBe("");
  });

  it("includes script ID and status for each result", () => {
    const execResult: ExecutionResult = {
      planId: "plan-1",
      results: [
        { scriptId: "read-file", exitCode: 0, stdout: "content", stderr: "" },
        { scriptId: "write-file", exitCode: 1, stdout: "", stderr: "error" },
      ],
      instructionFile: {
        planId: "plan-1",
        steps: [
          { scriptId: "read-file", params: { FILE_PATH: "src/foo.ts" }, order: 0 },
          { scriptId: "write-file", params: { FILE_PATH: "out.txt", CONTENT: "data" }, order: 1 },
        ],
      },
    };
    const summary = buildSideEffectSummary([execResult]);
    expect(summary).toContain("read-file");
    expect(summary).toContain("FILE_PATH=src/foo.ts");
    expect(summary).toContain("ok");
    expect(summary).toContain("write-file");
    expect(summary).toContain("exit 1");
  });
});
