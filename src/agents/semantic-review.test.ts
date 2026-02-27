import { describe, it, expect } from "vitest";
import { shouldSemanticReview, semanticReview, SemanticReviewError } from "./semantic-review.js";
import type { LLMClient } from "./claude-client.js";
import type { IdentityContext } from "../types.js";

const mockIdentity: IdentityContext = {
  soul: "# Soul\nBe helpful.",
  constitution: "# Constitution\nBe honest.",
  agents: [],
};

describe("shouldSemanticReview", () => {
  it("returns false when disabled", () => {
    expect(shouldSemanticReview({ enabled: false, mode: "always" })).toBe(false);
  });

  it("returns true when enabled with mode=always", () => {
    expect(shouldSemanticReview({ enabled: true, mode: "always" })).toBe(true);
  });

  it("returns false when enabled with mode=sampling (not yet implemented)", () => {
    expect(shouldSemanticReview({ enabled: true, mode: "sampling" })).toBe(false);
  });

  it("returns false when enabled with mode=fast-path-only (not yet implemented)", () => {
    expect(shouldSemanticReview({ enabled: true, mode: "fast-path-only" })).toBe(false);
  });
});

describe("semanticReview", () => {
  it("returns approved result when script matches plan", async () => {
    const client: LLMClient = {
      async sendMessage() {
        return {
          content: JSON.stringify({
            approved: true,
            concerns: [],
            planAlignment: "aligned",
          }),
          inputTokens: 200,
          outputTokens: 50,
        };
      },
      async sendMessages() {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };

    const result = await semanticReview(
      client,
      'echo "hello"',
      "Echo a greeting message",
      mockIdentity
    );

    expect(result.approved).toBe(true);
    expect(result.planAlignment).toBe("aligned");
    expect(result.concerns).toHaveLength(0);
  });

  it("returns rejected result when script diverges from plan", async () => {
    const client: LLMClient = {
      async sendMessage() {
        return {
          content: JSON.stringify({
            approved: false,
            concerns: ["Script deletes files but plan says read-only"],
            planAlignment: "divergent",
          }),
          inputTokens: 200,
          outputTokens: 80,
        };
      },
      async sendMessages() {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };

    const result = await semanticReview(
      client,
      "rm -rf /tmp/data",
      "Read and display file contents",
      mockIdentity
    );

    expect(result.approved).toBe(false);
    expect(result.planAlignment).toBe("divergent");
    expect(result.concerns).toContain("Script deletes files but plan says read-only");
  });
});

describe("SemanticReviewError", () => {
  it("includes concerns and alignment in message", () => {
    const error = new SemanticReviewError({
      approved: false,
      concerns: ["Extra file deletion", "Missing validation"],
      planAlignment: "divergent",
    });

    expect(error.message).toContain("Extra file deletion");
    expect(error.message).toContain("Missing validation");
    expect(error.message).toContain("divergent");
    expect(error.name).toBe("SemanticReviewError");
  });
});
