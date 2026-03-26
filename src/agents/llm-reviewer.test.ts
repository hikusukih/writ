import { describe, it, expect } from "vitest";
import { reviewWithLLM } from "./llm-reviewer.js";
import type { LLMClient, MessageParam } from "./claude-client.js";
import type { IdentityContext } from "../types.js";

const mockIdentity: IdentityContext = {
  soul: "# Soul\nBe helpful and safe.",
  constitution: "# Constitution\nBe honest. Protect secrets. No sudo.",
  agents: [],
};

function mockClient(responseContent: string): LLMClient {
  return {
    async sendMessage(_sys: string, _user: string) {
      return { content: responseContent, inputTokens: 10, outputTokens: 5 };
    },
    async sendMessages(_sys: string, _msgs: MessageParam[]) {
      return { content: "", inputTokens: 0, outputTokens: 0 };
    },
  };
}

describe("reviewWithLLM", () => {
  it("returns allow when LLM says allow", async () => {
    const client = mockClient('{"decision":"allow","reasoning":"Content is safe."}');
    const result = await reviewWithLLM("List files in /tmp", "orchestrator", mockIdentity, client);
    expect(result.decision).toBe("allow");
    expect(result.reasoning).toBe("Content is safe.");
    expect(result.degraded).toBeUndefined();
  });

  it("returns flag-and-halt when LLM says flag-and-halt", async () => {
    const client = mockClient(
      '{"decision":"flag-and-halt","reasoning":"Contains private key material."}'
    );
    const result = await reviewWithLLM(
      "-----BEGIN PRIVATE KEY-----",
      "orchestrator",
      mockIdentity,
      client
    );
    expect(result.decision).toBe("flag-and-halt");
    expect(result.reasoning).toContain("private key");
  });

  it("returns flag-and-continue for minor concerns", async () => {
    const client = mockClient(
      '{"decision":"flag-and-continue","reasoning":"Minor style issue, not blocking."}'
    );
    const result = await reviewWithLLM("Some output", "planner", mockIdentity, client);
    expect(result.decision).toBe("flag-and-continue");
  });

  it("returns request-modifications with modifications field", async () => {
    const client = mockClient(
      '{"decision":"request-modifications","reasoning":"Needs cleanup.","modifications":"Remove the path reference."}'
    );
    const result = await reviewWithLLM("Some output", "planner", mockIdentity, client);
    expect(result.decision).toBe("request-modifications");
    expect(result.modifications).toBe("Remove the path reference.");
  });

  it("handles markdown-fenced JSON in LLM response", async () => {
    const client = mockClient(
      '```json\n{"decision":"allow","reasoning":"Safe content."}\n```'
    );
    const result = await reviewWithLLM("Some output", "orchestrator", mockIdentity, client);
    expect(result.decision).toBe("allow");
  });

  it("falls back to rule-based review when LLM returns invalid JSON", async () => {
    const client = mockClient("I cannot determine the safety of this content.");
    // No parseable JSON — falls back to rule-based which detects sudo
    const result = await reviewWithLLM("Run sudo rm -rf /", "orchestrator", mockIdentity, client);
    expect(result.decision).toBe("flag-and-halt");
    expect(result.matchedRules).toContain("sudo-usage");
    expect(result.degraded).toBe(true);
  });

  it("returns fafc with summary when LLM says fafc", async () => {
    const client = mockClient(
      '{"decision":"fafc","reasoning":"This action deletes files permanently.","summary":"Permanent file deletion requires your approval."}'
    );
    const result = await reviewWithLLM("Delete all logs", "orchestrator", mockIdentity, client);
    expect(result.decision).toBe("fafc");
    expect(result.reasoning).toContain("deletes files");
    expect(result.summary).toBe("Permanent file deletion requires your approval.");
  });

  it("includes anti-patterns in reviewer prompt when provided", async () => {
    let capturedSystem = "";
    const client: LLMClient = {
      async sendMessage(sys: string, _user: string) {
        capturedSystem = sys;
        return { content: '{"decision":"allow","reasoning":"Safe."}', inputTokens: 10, outputTokens: 5 };
      },
      async sendMessages(_sys: string, _msgs: MessageParam[]) {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };
    await reviewWithLLM("Some output", "planner", mockIdentity, client, undefined, "- Never suggest deleting files without confirmation");
    expect(capturedSystem).toContain("## Known Anti-Patterns");
    expect(capturedSystem).toContain("Never suggest deleting files without confirmation");
  });

  it("omits anti-patterns section when not provided", async () => {
    let capturedSystem = "";
    const client: LLMClient = {
      async sendMessage(sys: string, _user: string) {
        capturedSystem = sys;
        return { content: '{"decision":"allow","reasoning":"Safe."}', inputTokens: 10, outputTokens: 5 };
      },
      async sendMessages(_sys: string, _msgs: MessageParam[]) {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };
    await reviewWithLLM("Some output", "planner", mockIdentity, client);
    expect(capturedSystem).not.toContain("## Known Anti-Patterns");
  });

  it("omits anti-patterns section for empty string", async () => {
    let capturedSystem = "";
    const client: LLMClient = {
      async sendMessage(sys: string, _user: string) {
        capturedSystem = sys;
        return { content: '{"decision":"allow","reasoning":"Safe."}', inputTokens: 10, outputTokens: 5 };
      },
      async sendMessages(_sys: string, _msgs: MessageParam[]) {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };
    await reviewWithLLM("Some output", "planner", mockIdentity, client, undefined, "");
    expect(capturedSystem).not.toContain("## Known Anti-Patterns");
  });

  it("falls back to rule-based review when LLM returns invalid decision value", async () => {
    const client = mockClient('{"decision":"unknown-decision","reasoning":"Hmm."}');
    // Invalid decision type — Zod parse fails, falls back to rule-based
    const result = await reviewWithLLM("Clean content here.", "orchestrator", mockIdentity, client);
    // Rule-based review of "Clean content here." should allow
    expect(result.decision).toBe("allow");
    expect(result.degraded).toBe(true);
  });
});
