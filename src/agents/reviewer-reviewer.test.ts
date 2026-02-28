import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { auditReviewDecision, sampleAndAudit } from "./reviewer-reviewer.js";
import { appendReviewLog, buildLogEntry } from "./review-log.js";
import type { LLMClient } from "./claude-client.js";
import type { IdentityContext, RRInput, ReviewLogEntry } from "../types.js";

const mockIdentity: IdentityContext = {
  soul: "# Soul\nBe helpful.",
  constitution: "# Constitution\nBe honest.",
  agents: [
    {
      id: "reviewer-reviewer",
      name: "Reviewer-Reviewer",
      class: "os",
      configFile: "reviewer-reviewer-agent.md",
      agentMd: "# Reviewer-Reviewer\nYou audit reviewer decisions.",
      permissions: { canRead: [], canWrite: [] },
    },
  ],
};

function makeLogEntry(overrides: Partial<ReviewLogEntry> = {}): ReviewLogEntry {
  return {
    timestamp: "2026-02-25T12:00:00-05:00",
    subjectAgentId: "orchestrator",
    decision: "allow",
    reasoning: "Output is safe and helpful.",
    reviewerType: "llm",
    contentHash: "abc123",
    ...overrides,
  };
}

describe("auditReviewDecision", () => {
  it("returns consistent=true for a sound reviewer decision", async () => {
    const client: LLMClient = {
      async sendMessage() {
        return {
          content: JSON.stringify({ consistent: true, override: null, violationSummary: null }),
          inputTokens: 100,
          outputTokens: 20,
        };
      },
      async sendMessages() {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };

    const input: RRInput = {
      reviewLogEntry: makeLogEntry(),
      soul: mockIdentity.soul,
      constitution: mockIdentity.constitution,
    };

    const result = await auditReviewDecision(client, input, mockIdentity);
    expect(result.consistent).toBe(true);
    expect(result.override).toBeUndefined();
    expect(result.violationSummary).toBeUndefined();
  });

  it("returns inconsistent with override for a bad reviewer decision", async () => {
    const client: LLMClient = {
      async sendMessage() {
        return {
          content: JSON.stringify({
            consistent: false,
            override: "flag-and-halt",
            violationSummary: "Reviewer allowed output that could expose credentials.",
          }),
          inputTokens: 100,
          outputTokens: 50,
        };
      },
      async sendMessages() {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };

    const input: RRInput = {
      reviewLogEntry: makeLogEntry({ decision: "allow" }),
      soul: mockIdentity.soul,
      constitution: mockIdentity.constitution,
    };

    const result = await auditReviewDecision(client, input, mockIdentity);
    expect(result.consistent).toBe(false);
    expect(result.override).toBe("flag-and-halt");
    expect(result.violationSummary).toContain("credentials");
  });

  it("validates input with Zod (rejects invalid input)", async () => {
    const client: LLMClient = {
      async sendMessage() {
        return { content: "{}", inputTokens: 0, outputTokens: 0 };
      },
      async sendMessages() {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };

    const badInput = {
      reviewLogEntry: { decision: "allow" }, // missing fields
      soul: "test",
      constitution: "test",
    } as unknown as RRInput;

    await expect(auditReviewDecision(client, badInput, mockIdentity)).rejects.toThrow();
  });
});

describe("sampleAndAudit", () => {
  let logsDir: string;

  beforeAll(async () => {
    logsDir = await mkdtemp(join(tmpdir(), "writ-rr-"));
  });

  afterAll(async () => {
    await rm(logsDir, { recursive: true });
  });

  it("returns null when sampleRate is 0 (never samples)", async () => {
    const client: LLMClient = {
      async sendMessage() {
        throw new Error("Should not be called");
      },
      async sendMessages() {
        throw new Error("Should not be called");
      },
    };

    const result = await sampleAndAudit(client, mockIdentity, undefined, logsDir, 0);
    expect(result).toBeNull();
  });

  it("returns null when no review log entries exist", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "writ-rr-empty-"));
    const client: LLMClient = {
      async sendMessage() {
        throw new Error("Should not be called");
      },
      async sendMessages() {
        throw new Error("Should not be called");
      },
    };

    const result = await sampleAndAudit(client, mockIdentity, undefined, emptyDir, 1.0);
    expect(result).toBeNull();
    await rm(emptyDir, { recursive: true });
  });

  it("audits a review log entry when sampleRate is 1 (always samples)", async () => {
    // Seed a review log entry
    const entry = buildLogEntry("orchestrator", "allow", "Safe output.", "llm", "test content");
    await appendReviewLog(entry, logsDir);

    const client: LLMClient = {
      async sendMessage() {
        return {
          content: JSON.stringify({ consistent: true }),
          inputTokens: 50,
          outputTokens: 10,
        };
      },
      async sendMessages() {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };

    const result = await sampleAndAudit(client, mockIdentity, undefined, logsDir, 1.0);
    expect(result).not.toBeNull();
    expect(result!.consistent).toBe(true);
  });

  it("writes audit results to rr-audit.jsonl", async () => {
    const auditLogPath = join(logsDir, "rr-audit.jsonl");
    const content = await readFile(auditLogPath, "utf-8");
    const lines = content.trim().split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBeGreaterThan(0);

    const lastEntry = JSON.parse(lines[lines.length - 1]);
    expect(lastEntry.auditedEntry).toBeDefined();
    expect(lastEntry.result).toBeDefined();
    expect(lastEntry.result.consistent).toBe(true);
  });

  it("logs inconsistency details when consistent=false", async () => {
    const client: LLMClient = {
      async sendMessage() {
        return {
          content: JSON.stringify({
            consistent: false,
            override: "flag-and-halt",
            violationSummary: "Reviewer missed a secret-guarding violation.",
          }),
          inputTokens: 50,
          outputTokens: 30,
        };
      },
      async sendMessages() {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };

    const result = await sampleAndAudit(client, mockIdentity, undefined, logsDir, 1.0);
    expect(result).not.toBeNull();
    expect(result!.consistent).toBe(false);
    expect(result!.override).toBe("flag-and-halt");

    // Check audit log
    const auditLogPath = join(logsDir, "rr-audit.jsonl");
    const content = await readFile(auditLogPath, "utf-8");
    const lines = content.trim().split("\n");
    const lastEntry = JSON.parse(lines[lines.length - 1]);
    expect(lastEntry.result.consistent).toBe(false);
    expect(lastEntry.result.override).toBe("flag-and-halt");
  });
});
