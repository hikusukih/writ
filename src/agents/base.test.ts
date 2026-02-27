import { describe, it, expect } from "vitest";
import { invokeAgent } from "./base.js";
import { buildSystemPrompt } from "./prompt-builder.js";
import type { LLMClient } from "./claude-client.js";
import type { AgentConfig, IdentityContext } from "../types.js";

const mockIdentity: IdentityContext = {
  soul: "# Soul\nBe helpful and direct.",
  constitution: "# Constitution\nBe honest. Guard secrets.",
  agents: [
    {
      id: "test-agent",
      name: "Test Agent",
      class: "action",
      configFile: "test-agent.md",
      agentMd: "# Test Agent\nYou are a test agent.",
      permissions: { canRead: [], canWrite: [] },
    },
  ],
};

const mockAgentConfig: AgentConfig = mockIdentity.agents[0];

function createMockClient(responseContent: string): LLMClient {
  const response = { content: responseContent, inputTokens: 100, outputTokens: 50 };
  return {
    async sendMessage(_system: string, _user: string) { return response; },
    async sendMessages(_system: string, _messages: unknown[]) { return response; },
  };
}

describe("buildSystemPrompt", () => {
  it("includes SOUL.md content", () => {
    const prompt = buildSystemPrompt(mockAgentConfig, mockIdentity);
    expect(prompt).toContain("Be helpful and direct");
  });

  it("includes CONSTITUTION.md content", () => {
    const prompt = buildSystemPrompt(mockAgentConfig, mockIdentity);
    expect(prompt).toContain("Be honest");
    expect(prompt).toContain("Guard secrets");
  });

  it("includes agent-specific config", () => {
    const prompt = buildSystemPrompt(mockAgentConfig, mockIdentity);
    expect(prompt).toContain("Test Agent");
    expect(prompt).toContain("You are a test agent");
  });
});

describe("invokeAgent", () => {
  it("returns typed output from Claude response", async () => {
    const client = createMockClient("Here is the result.");
    const output = await invokeAgent(
      client,
      mockAgentConfig,
      "Do something",
      mockIdentity
    );

    expect(output.content).toBe("Here is the result.");
    expect(output.usage.inputTokens).toBe(100);
    expect(output.usage.outputTokens).toBe(50);
  });

  it("passes system prompt including identity to client", async () => {
    let capturedSystem = "";
    const ok = { content: "ok", inputTokens: 10, outputTokens: 5 };
    const client: LLMClient = {
      async sendMessage(system: string, _user: string) {
        capturedSystem = system;
        return ok;
      },
      async sendMessages(_system: string, _messages: unknown[]) { return ok; },
    };

    await invokeAgent(client, mockAgentConfig, "test input", mockIdentity);

    expect(capturedSystem).toContain("Be helpful and direct");
    expect(capturedSystem).toContain("Be honest");
    expect(capturedSystem).toContain("Test Agent");
  });

  it("passes user input as the message", async () => {
    let capturedUser = "";
    const ok = { content: "ok", inputTokens: 10, outputTokens: 5 };
    const client: LLMClient = {
      async sendMessage(_system: string, user: string) {
        capturedUser = user;
        return ok;
      },
      async sendMessages(_system: string, _messages: unknown[]) { return ok; },
    };

    await invokeAgent(client, mockAgentConfig, "list all files", mockIdentity);

    expect(capturedUser).toBe("list all files");
  });
});
