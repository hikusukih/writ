import { describe, it, expect, vi } from "vitest";
import { applyReview } from "./reviewed.js";
import type { IdentityContext } from "../types.js";
import type { IOAdapter } from "../io/IOAdapter.js";
import type { LLMClient, MessageParam } from "./claude-client.js";

const mockIdentity: IdentityContext = {
  soul: "# Soul\nBe helpful.",
  constitution: "# Constitution\nBe honest.",
  agents: [],
};

function makeAdapter(): { adapter: IOAdapter; statusMessages: string[] } {
  const statusMessages: string[] = [];
  const adapter = {
    sendStatus: vi.fn(async (msg: string) => { statusMessages.push(msg); }),
    sendResult: vi.fn(),
    sendError: vi.fn(),
    sendReviewBlock: vi.fn(),
    sendAcknowledgment: vi.fn(),
    sendProgress: vi.fn(),
    onRequest: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    requestConfirmation: vi.fn(),
    getChannel: vi.fn(() => ["test"]),
  } as IOAdapter;
  return { adapter, statusMessages };
}

function makeDegradedClient(): LLMClient {
  return {
    async sendMessage(): Promise<never> { throw new Error("LLM unavailable"); },
    async sendMessages(_s: string, _m: MessageParam[]): Promise<never> { throw new Error("LLM unavailable"); },
  };
}

function makeAllowClient(): LLMClient {
  return {
    async sendMessage() {
      return { content: '{"decision":"allow","reasoning":"Safe."}', inputTokens: 0, outputTokens: 0 };
    },
    async sendMessages(_s: string, _m: MessageParam[]) {
      return { content: "", inputTokens: 0, outputTokens: 0 };
    },
  };
}

describe("applyReview — degradation surfacing", () => {
  it("sends degradation status to adapter when LLM reviewer fails", async () => {
    const { adapter, statusMessages } = makeAdapter();
    const client = makeDegradedClient();

    await applyReview("safe content", mockIdentity, { client, adapter, subjectAgentId: "orchestrator" });

    expect(statusMessages.some((m) => m.includes("rule-based fallback"))).toBe(true);
  });

  it("does NOT send degradation status when LLM reviewer succeeds", async () => {
    const { adapter, statusMessages } = makeAdapter();
    const client = makeAllowClient();

    await applyReview("safe content", mockIdentity, { client, adapter, subjectAgentId: "orchestrator" });

    expect(statusMessages).toHaveLength(0);
  });

  it("does NOT send degradation status when no adapter is provided", async () => {
    const client = makeDegradedClient();
    // Should not throw even without adapter
    await expect(
      applyReview("safe content", mockIdentity, { client, subjectAgentId: "orchestrator" })
    ).resolves.toBeUndefined();
  });
});
