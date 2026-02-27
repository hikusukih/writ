import { describe, it, expect, vi } from "vitest";
import { handleFAFC } from "./human-judgment-agent.js";
import type { ReviewResult, IdentityContext } from "../types.js";
import type { IOAdapter } from "../io/IOAdapter.js";
import type { LLMClient, MessageParam } from "./claude-client.js";

const mockIdentity: IdentityContext = {
  soul: "# Soul\nBe helpful.",
  constitution: "# Constitution\nBe honest.",
  agents: [],
};

function mockAdapter(approves: boolean): IOAdapter {
  return {
    sendResult: vi.fn(),
    sendError: vi.fn(),
    sendReviewBlock: vi.fn(),
    sendStatus: vi.fn(),
    requestConfirmation: vi.fn().mockResolvedValue(approves),
    onRequest: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
  };
}

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

function failingClient(): LLMClient {
  return {
    async sendMessage() {
      throw new Error("API failure");
    },
    async sendMessages() {
      throw new Error("API failure");
    },
  };
}

const fafcReview: ReviewResult = {
  decision: "fafc",
  reasoning: "This action will delete all log files permanently.",
  summary: "Permanent log deletion requires your approval.",
};

describe("handleFAFC", () => {
  it("generates summary via LLM when client is provided", async () => {
    const adapter = mockAdapter(true);
    const client = mockClient("The system wants to delete your log files permanently.");
    const result = await handleFAFC(fafcReview, mockIdentity, adapter, client);

    expect(result).toBe(true);
    expect(adapter.requestConfirmation).toHaveBeenCalledWith(
      "The system wants to delete your log files permanently.",
      fafcReview.reasoning
    );
  });

  it("falls back to review.summary when no client provided", async () => {
    const adapter = mockAdapter(true);
    const result = await handleFAFC(fafcReview, mockIdentity, adapter);

    expect(result).toBe(true);
    expect(adapter.requestConfirmation).toHaveBeenCalledWith(
      "Permanent log deletion requires your approval.",
      fafcReview.reasoning
    );
  });

  it("falls back to review.reasoning when no client and no summary", async () => {
    const adapter = mockAdapter(false);
    const reviewNoSummary: ReviewResult = {
      decision: "fafc",
      reasoning: "Elevated permissions requested.",
    };
    const result = await handleFAFC(reviewNoSummary, mockIdentity, adapter);

    expect(result).toBe(false);
    expect(adapter.requestConfirmation).toHaveBeenCalledWith(
      "Elevated permissions requested.",
      "Elevated permissions requested."
    );
  });

  it("returns false when user denies", async () => {
    const adapter = mockAdapter(false);
    const client = mockClient("Summary text");
    const result = await handleFAFC(fafcReview, mockIdentity, adapter, client);

    expect(result).toBe(false);
  });

  it("falls back to review.summary when LLM call fails", async () => {
    const adapter = mockAdapter(true);
    const client = failingClient();
    const result = await handleFAFC(fafcReview, mockIdentity, adapter, client);

    expect(result).toBe(true);
    expect(adapter.requestConfirmation).toHaveBeenCalledWith(
      "Permanent log deletion requires your approval.",
      fafcReview.reasoning
    );
  });
});
