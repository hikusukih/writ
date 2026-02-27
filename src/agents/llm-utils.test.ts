import { describe, it, expect } from "vitest";
import { z } from "zod";
import { extractJson, callWithValidation } from "./llm-utils.js";
import type { LLMClient, MessageParam } from "./claude-client.js";

const TestSchema = z.object({
  name: z.string(),
  value: z.number(),
});

function mockClient(responses: string[]): LLMClient {
  let callIndex = 0;
  return {
    async sendMessage(_sys: string, _user: string) {
      const content = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return { content, inputTokens: 10, outputTokens: 5 };
    },
    async sendMessages(_sys: string, _msgs: MessageParam[]) {
      return { content: "", inputTokens: 0, outputTokens: 0 };
    },
  };
}

describe("extractJson", () => {
  it("extracts from markdown code fence", () => {
    const result = extractJson('```json\n{"key":"value"}\n```');
    expect(result).toBe('{"key":"value"}');
  });

  it("extracts raw JSON object", () => {
    const result = extractJson('Here is the result: {"key":"value"} done.');
    expect(result).toBe('{"key":"value"}');
  });

  it("returns trimmed text when no JSON found", () => {
    const result = extractJson("  just text  ");
    expect(result).toBe("just text");
  });
});

describe("callWithValidation", () => {
  it("succeeds on valid first response", async () => {
    const client = mockClient(['{"name":"test","value":42}']);
    const result = await callWithValidation(client, "sys", "user", TestSchema, { label: "test" });
    expect(result).toEqual({ name: "test", value: 42 });
  });

  it("retries on invalid first response, succeeds on second", async () => {
    const client = mockClient([
      '{"name":"test","value":"not-a-number"}', // fails Zod
      '{"name":"test","value":42}',             // succeeds
    ]);
    const result = await callWithValidation(client, "sys", "user", TestSchema, { label: "test" });
    expect(result).toEqual({ name: "test", value: 42 });
  });

  it("throws after all retries exhausted", async () => {
    const client = mockClient([
      "not json at all",
      "still not json",
      "nope",
    ]);
    await expect(
      callWithValidation(client, "sys", "user", TestSchema, { label: "test" })
    ).rejects.toThrow();
  });

  it("includes validation error in retry message", async () => {
    let capturedMessage = "";
    let callCount = 0;
    const client: LLMClient = {
      async sendMessage(_sys: string, user: string) {
        callCount++;
        capturedMessage = user;
        if (callCount === 1) {
          return { content: '{"name":123,"value":"bad"}', inputTokens: 10, outputTokens: 5 };
        }
        return { content: '{"name":"ok","value":1}', inputTokens: 10, outputTokens: 5 };
      },
      async sendMessages(_sys: string, _msgs: MessageParam[]) {
        return { content: "", inputTokens: 0, outputTokens: 0 };
      },
    };
    await callWithValidation(client, "sys", "user", TestSchema, { label: "test" });
    expect(capturedMessage).toContain("Your previous response failed validation");
  });

  it("respects maxRetries=0 (single attempt)", async () => {
    const client = mockClient(["not json"]);
    await expect(
      callWithValidation(client, "sys", "user", TestSchema, { maxRetries: 0 })
    ).rejects.toThrow();
  });

  it("handles markdown-fenced responses", async () => {
    const client = mockClient(['```json\n{"name":"fenced","value":99}\n```']);
    const result = await callWithValidation(client, "sys", "user", TestSchema);
    expect(result).toEqual({ name: "fenced", value: 99 });
  });
});
