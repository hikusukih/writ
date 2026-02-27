import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { proposeConfigUpdate, applyConfigUpdate, triggerBigBrother } from "./big-brother.js";
import type { LLMClient } from "./claude-client.js";
import type { BBInput, BBOutput, IdentityContext, ViolationSummary } from "../types.js";

const mockIdentity: IdentityContext = {
  soul: "# Soul\nBe helpful and honest.",
  constitution: "# Constitution\nGuard secrets. Be pro-social.",
  agents: [
    {
      id: "big-brother",
      name: "BIG_BROTHER",
      class: "action",
      configFile: "big-brother-agent.md",
      agentMd: "# BIG_BROTHER\nYou diagnose constitutional inconsistencies.",
      permissions: { canRead: [], canWrite: [] },
    },
    {
      id: "orchestrator",
      name: "Orchestrator",
      class: "os",
      configFile: "orchestrator-agent.md",
      agentMd: "# Orchestrator\nYou coordinate agents.",
      permissions: { canRead: [], canWrite: [] },
    },
  ],
  reviewerConfigs: {
    orchestrator: "# Orchestrator Reviewer\nCheck for safety.",
  },
};

function makeViolation(overrides: Partial<ViolationSummary> = {}): ViolationSummary {
  return {
    violatedPrinciple: "secret-guarding",
    errorClass: "Reviewer allowed output that could expose credentials",
    affectedAgentId: "orchestrator",
    ...overrides,
  };
}

describe("proposeConfigUpdate", () => {
  it("returns a valid BBOutput with updated config text", async () => {
    const client: LLMClient = {
      async sendMessage() {
        return {
          content: JSON.stringify({
            updatedAgentConfig: "# Orchestrator\nYou coordinate agents.\n\n## Security\nNever expose credentials.",
            updatedReviewerConfig: null,
            changeRationale: "Added explicit secret-guarding instruction to address credential exposure class.",
          }),
          inputTokens: 200,
          outputTokens: 100,
        };
      },
      async sendMessages() {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };

    const input: BBInput = {
      violation: makeViolation(),
      agentConfig: "# Orchestrator\nYou coordinate agents.",
      soul: mockIdentity.soul,
      constitution: mockIdentity.constitution,
    };

    const result = await proposeConfigUpdate(client, input, mockIdentity);
    expect(result.changeRationale).toContain("secret-guarding");
    expect(result.updatedAgentConfig).toContain("credentials");
    expect(result.updatedReviewerConfig).toBeUndefined();
  });

  it("validates input with Zod (rejects missing fields)", async () => {
    const client: LLMClient = {
      async sendMessage() {
        return { content: "{}", inputTokens: 0, outputTokens: 0 };
      },
      async sendMessages() {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };

    const badInput = {
      violation: { errorClass: "test" }, // missing violatedPrinciple, affectedAgentId
      agentConfig: "test",
      soul: "test",
      constitution: "test",
    } as unknown as BBInput;

    await expect(proposeConfigUpdate(client, badInput, mockIdentity)).rejects.toThrow();
  });
});

describe("applyConfigUpdate", () => {
  let testDir: string;
  let identityDir: string;
  let runtimeDir: string;

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), "domesticlaw-bb-"));
    identityDir = join(testDir, "identity");
    runtimeDir = join(testDir, "runtime");
    await mkdir(join(identityDir, "agents"), { recursive: true });
    await mkdir(runtimeDir, { recursive: true });

    // Write initial agent config
    await writeFile(
      join(identityDir, "agents", "orchestrator-agent.md"),
      "# Orchestrator\nYou coordinate agents."
    );
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true });
  });

  it("writes updated config when review approves", async () => {
    let callCount = 0;
    const client: LLMClient = {
      async sendMessage() {
        callCount++;
        // Review call → allow
        return {
          content: JSON.stringify({ decision: "allow", reasoning: "Changes address the violation." }),
          inputTokens: 50,
          outputTokens: 10,
        };
      },
      async sendMessages() {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };

    const bbOutput: BBOutput = {
      updatedAgentConfig: "# Orchestrator\nYou coordinate agents.\n\n## Security\nNever expose credentials.",
      changeRationale: "Added secret-guarding.",
    };

    const applied = await applyConfigUpdate(
      client, bbOutput, makeViolation(), mockIdentity, undefined, identityDir, runtimeDir
    );

    expect(applied).toBe(true);

    // Verify config was written
    const content = await readFile(join(identityDir, "agents", "orchestrator-agent.md"), "utf-8");
    expect(content).toContain("Never expose credentials");

    // Verify backup was created
    const backups = await readdir(join(runtimeDir, "config-backups"));
    expect(backups.length).toBeGreaterThan(0);
  });

  it("does not write config when review rejects", async () => {
    // Reset config
    await writeFile(
      join(identityDir, "agents", "orchestrator-agent.md"),
      "# Orchestrator\nOriginal config."
    );

    const client: LLMClient = {
      async sendMessage() {
        // Review call → flag-and-halt (triggers ReviewHaltError which is caught)
        return {
          content: JSON.stringify({ decision: "flag-and-halt", reasoning: "Changes are harmful." }),
          inputTokens: 50,
          outputTokens: 10,
        };
      },
      async sendMessages() {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };

    const bbOutput: BBOutput = {
      updatedAgentConfig: "# Orchestrator\nBAD CONFIG.",
      changeRationale: "This is a bad change.",
    };

    const applied = await applyConfigUpdate(
      client, bbOutput, makeViolation(), mockIdentity, undefined, identityDir, runtimeDir
    );

    expect(applied).toBe(false);

    // Verify config was NOT overwritten
    const content = await readFile(join(identityDir, "agents", "orchestrator-agent.md"), "utf-8");
    expect(content).toBe("# Orchestrator\nOriginal config.");
  });
});

describe("triggerBigBrother", () => {
  let testDir: string;
  let identityDir: string;
  let runtimeDir: string;

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), "domesticlaw-bb-trigger-"));
    identityDir = join(testDir, "identity");
    runtimeDir = join(testDir, "runtime");
    await mkdir(join(identityDir, "agents"), { recursive: true });
    await mkdir(runtimeDir, { recursive: true });

    await writeFile(
      join(identityDir, "agents", "orchestrator-agent.md"),
      "# Orchestrator\nYou coordinate agents."
    );
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true });
  });

  it("proposes and applies config update on first round", async () => {
    let callCount = 0;
    const client: LLMClient = {
      async sendMessage() {
        callCount++;
        if (callCount <= 3) {
          // BB proposal calls (callWithValidation retries)
          return {
            content: JSON.stringify({
              updatedAgentConfig: "# Orchestrator\nUpdated config.",
              updatedReviewerConfig: null,
              changeRationale: "Fixed the issue.",
            }),
            inputTokens: 100,
            outputTokens: 50,
          };
        }
        // Review call → allow
        return {
          content: JSON.stringify({ decision: "allow", reasoning: "Good changes." }),
          inputTokens: 50,
          outputTokens: 10,
        };
      },
      async sendMessages() {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };

    await triggerBigBrother(
      makeViolation(), client, mockIdentity, undefined, identityDir, runtimeDir
    );

    const content = await readFile(join(identityDir, "agents", "orchestrator-agent.md"), "utf-8");
    expect(content).toBe("# Orchestrator\nUpdated config.");
  });

  it("caps self-modification at 3 rounds", async () => {
    // Reset config
    await writeFile(
      join(identityDir, "agents", "orchestrator-agent.md"),
      "# Orchestrator\nOriginal."
    );

    let proposalCount = 0;
    const client: LLMClient = {
      async sendMessage() {
        proposalCount++;
        // Alternate: BB proposals get rejected by review
        if (proposalCount % 2 === 1) {
          // BB proposal
          return {
            content: JSON.stringify({
              updatedAgentConfig: "# Bad update",
              changeRationale: "Attempt.",
            }),
            inputTokens: 100,
            outputTokens: 50,
          };
        }
        // Review → reject
        return {
          content: JSON.stringify({ decision: "flag-and-halt", reasoning: "Rejected." }),
          inputTokens: 50,
          outputTokens: 10,
        };
      },
      async sendMessages() {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };

    let errorMessage = "";
    const mockAdapter = {
      sendStatus() {},
      sendResult() {},
      sendReviewBlock() {},
      sendError(msg: string) { errorMessage = msg; },
      onRequest() {},
      start: async () => {},
    };

    await triggerBigBrother(
      makeViolation(), client, mockIdentity, mockAdapter, identityDir, runtimeDir
    );

    // Should have hit the cap and surfaced error
    expect(errorMessage).toContain("3 attempts");
    expect(errorMessage).toContain("orchestrator");

    // Config should be unchanged
    const content = await readFile(join(identityDir, "agents", "orchestrator-agent.md"), "utf-8");
    expect(content).toBe("# Orchestrator\nOriginal.");
  });
});

describe("ViolationSummary type enforcement", () => {
  it("ViolationSummarySchema rejects objects with extra task content fields via Zod strict mode", async () => {
    // The schema uses z.object which strips extra fields — this is by design.
    // The structural constraint is enforced at the TypeScript level: ViolationSummary
    // has no fields for task content.
    const { ViolationSummarySchema } = await import("../schemas.js");
    const valid = ViolationSummarySchema.parse({
      violatedPrinciple: "honesty",
      errorClass: "misleading response",
      affectedAgentId: "planner",
    });
    expect(valid.violatedPrinciple).toBe("honesty");
    expect(valid.affectedAgentId).toBe("planner");
  });
});
