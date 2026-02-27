import { describe, it, expect, vi } from "vitest";
import { reviewOutput } from "./reviewer.js";
import { withReview, applyReview, ReviewHaltError } from "./reviewed.js";
import type { AgentOutput, IdentityContext } from "../types.js";

const mockIdentity: IdentityContext = {
  soul: "soul",
  constitution: "constitution",
  agents: [],
};

describe("reviewOutput", () => {
  it("allows clean output", () => {
    const result = reviewOutput("Here are the files in your directory.", mockIdentity);
    expect(result.decision).toBe("allow");
  });

  it("flags env variable references", () => {
    const result = reviewOutput("Use $ANTHROPIC_API_KEY to authenticate.", mockIdentity);
    expect(result.decision).toBe("flag-and-halt");
    expect(result.matchedRules).toContain("env-variable-reference");
  });

  it("flags process.env references", () => {
    const result = reviewOutput("Set process.env.SECRET_KEY = 'abc'", mockIdentity);
    expect(result.decision).toBe("flag-and-halt");
    expect(result.matchedRules).toContain("env-variable-reference");
  });

  it("flags API key patterns", () => {
    const result = reviewOutput('api_key: "sk-1234567890abcdef1234"', mockIdentity);
    expect(result.decision).toBe("flag-and-halt");
    expect(result.matchedRules).toContain("api-key-pattern");
  });

  it("flags sudo usage", () => {
    const result = reviewOutput("Run sudo apt-get install something", mockIdentity);
    expect(result.decision).toBe("flag-and-halt");
    expect(result.matchedRules).toContain("sudo-usage");
  });

  it("flags chmod 777", () => {
    const result = reviewOutput("chmod 777 /var/www", mockIdentity);
    expect(result.decision).toBe("flag-and-halt");
    expect(result.matchedRules).toContain("dangerous-permissions");
  });

  it("flags private keys", () => {
    const result = reviewOutput("-----BEGIN RSA PRIVATE KEY-----\nMIIE...", mockIdentity);
    expect(result.decision).toBe("flag-and-halt");
    expect(result.matchedRules).toContain("private-key-block");
  });

  it("reports multiple rule violations", () => {
    const result = reviewOutput("sudo chmod 777 /etc", mockIdentity);
    expect(result.decision).toBe("flag-and-halt");
    expect(result.matchedRules).toContain("sudo-usage");
    expect(result.matchedRules).toContain("dangerous-permissions");
  });
});

describe("withReview", () => {
  const cleanOutput: AgentOutput = {
    content: "Here are the files.",
    usage: { inputTokens: 10, outputTokens: 5 },
  };

  const dangerousOutput: AgentOutput = {
    content: "Run sudo rm -rf /",
    usage: { inputTokens: 10, outputTokens: 5 },
  };

  it("passes through clean output", async () => {
    const agent = vi.fn().mockResolvedValue(cleanOutput);
    const reviewed = withReview(agent, mockIdentity);

    const result = await reviewed("list files");
    expect(result.content).toBe("Here are the files.");
  });

  it("throws ReviewHaltError on dangerous output without callback", async () => {
    const agent = vi.fn().mockResolvedValue(dangerousOutput);
    const reviewed = withReview(agent, mockIdentity);

    await expect(reviewed("do something dangerous")).rejects.toThrow(ReviewHaltError);
  });

  it("calls halt callback and throws if user rejects", async () => {
    const agent = vi.fn().mockResolvedValue(dangerousOutput);
    const onHalt = vi.fn().mockResolvedValue(false);
    const reviewed = withReview(agent, mockIdentity, onHalt);

    await expect(reviewed("do it")).rejects.toThrow(ReviewHaltError);
    expect(onHalt).toHaveBeenCalledWith(
      expect.stringContaining("sudo"),
      dangerousOutput.content
    );
  });

  it("passes through if user approves via halt callback", async () => {
    const agent = vi.fn().mockResolvedValue(dangerousOutput);
    const onHalt = vi.fn().mockResolvedValue(true);
    const reviewed = withReview(agent, mockIdentity, onHalt);

    const result = await reviewed("do it");
    expect(result.content).toBe("Run sudo rm -rf /");
  });
});

describe("applyReview (rule-based, no LLM client)", () => {
  it("does not throw on clean content", async () => {
    await expect(applyReview("Here are the files.", mockIdentity)).resolves.toBeUndefined();
  });

  it("throws ReviewHaltError on dangerous content", async () => {
    await expect(applyReview("Run sudo rm -rf /", mockIdentity)).rejects.toThrow(ReviewHaltError);
  });

  it("includes matched rules in the error", async () => {
    try {
      await applyReview("Run sudo chmod 777 /etc", mockIdentity);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ReviewHaltError);
      expect((err as ReviewHaltError).matchedRules).toContain("sudo-usage");
      expect((err as ReviewHaltError).matchedRules).toContain("dangerous-permissions");
    }
  });

  it("skips review when skipReview is true", async () => {
    await expect(
      applyReview("Run sudo rm -rf /", mockIdentity, { skipReview: true })
    ).resolves.toBeUndefined();
  });

  it("uses LLM review when client is provided and LLM returns allow", async () => {
    const mockClient = {
      async sendMessage(_sys: string, _user: string) {
        return {
          content: '{"decision":"allow","reasoning":"Content looks safe."}',
          inputTokens: 10,
          outputTokens: 5,
        };
      },
      async sendMessages(_sys: string, _msgs: import("./claude-client.js").MessageParam[]) {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };
    // Even though content has sudo, LLM says allow
    await expect(
      applyReview("Run sudo rm -rf /", mockIdentity, { client: mockClient })
    ).resolves.toBeUndefined();
  });

  it("throws when LLM review returns flag-and-halt", async () => {
    const mockClient = {
      async sendMessage(_sys: string, _user: string) {
        return {
          content: '{"decision":"flag-and-halt","reasoning":"Contains dangerous sudo command."}',
          inputTokens: 10,
          outputTokens: 5,
        };
      },
      async sendMessages(_sys: string, _msgs: import("./claude-client.js").MessageParam[]) {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };
    await expect(
      applyReview("Some content", mockIdentity, { client: mockClient })
    ).rejects.toThrow(ReviewHaltError);
  });

  it("passes reviewer config from identity.reviewerConfigs when subjectAgentId is provided", async () => {
    let capturedSystem = "";
    const mockClient = {
      async sendMessage(sys: string, _user: string) {
        capturedSystem = sys;
        return {
          content: '{"decision":"allow","reasoning":"Safe."}',
          inputTokens: 10,
          outputTokens: 5,
        };
      },
      async sendMessages(_sys: string, _msgs: import("./claude-client.js").MessageParam[]) {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };
    const identityWithReviewerConfig: IdentityContext = {
      ...mockIdentity,
      reviewerConfigs: { "my-agent": "Flag anything mentioning bananas." },
    };
    await applyReview("Safe content", identityWithReviewerConfig, { client: mockClient, skipReview: false, subjectAgentId: "my-agent" });
    expect(capturedSystem).toContain("Flag anything mentioning bananas.");
  });

  it("throws ReviewHaltError on FAFC when no adapter provided (backward compat)", async () => {
    const mockClient = {
      async sendMessage(_sys: string, _user: string) {
        return {
          content: '{"decision":"fafc","reasoning":"Needs confirmation.","summary":"Please confirm."}',
          inputTokens: 10,
          outputTokens: 5,
        };
      },
      async sendMessages(_sys: string, _msgs: import("./claude-client.js").MessageParam[]) {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };
    await expect(
      applyReview("Some content", mockIdentity, { client: mockClient })
    ).rejects.toThrow(ReviewHaltError);
  });

  it("continues on FAFC when adapter is provided and user approves", async () => {
    const mockClient = {
      async sendMessage(_sys: string, _user: string) {
        return {
          content: '{"decision":"fafc","reasoning":"Needs confirmation.","summary":"Please confirm."}',
          inputTokens: 10,
          outputTokens: 5,
        };
      },
      async sendMessages(_sys: string, _msgs: import("./claude-client.js").MessageParam[]) {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };
    const mockAdapter = {
      sendResult: () => {},
      sendError: () => {},
      sendReviewBlock: () => {},
      sendStatus: () => {},
      requestConfirmation: async () => true,
      onRequest: () => {},
      start: async () => {},
      stop: () => {},
    };
    await expect(
      applyReview("Some content", mockIdentity, { client: mockClient, adapter: mockAdapter })
    ).resolves.toBeUndefined();
  });

  it("throws ReviewHaltError on FAFC when adapter is provided but user denies", async () => {
    const mockClient = {
      async sendMessage(_sys: string, _user: string) {
        return {
          content: '{"decision":"fafc","reasoning":"Needs confirmation.","summary":"Please confirm."}',
          inputTokens: 10,
          outputTokens: 5,
        };
      },
      async sendMessages(_sys: string, _msgs: import("./claude-client.js").MessageParam[]) {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };
    const mockAdapter = {
      sendResult: () => {},
      sendError: () => {},
      sendReviewBlock: () => {},
      sendStatus: () => {},
      requestConfirmation: async () => false,
      onRequest: () => {},
      start: async () => {},
      stop: () => {},
    };
    await expect(
      applyReview("Some content", mockIdentity, { client: mockClient, adapter: mockAdapter })
    ).rejects.toThrow(ReviewHaltError);
  });
});
