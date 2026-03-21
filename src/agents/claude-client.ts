import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.js";
import { createOllamaClient } from "./ollama-client.js";
import { verbose } from "../logger.js";

export type { MessageParam };

export interface ClaudeResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LLMClient {
  sendMessage(
    systemPrompt: string,
    userMessage: string,
    agentId?: string
  ): Promise<ClaudeResponse>;

  sendMessages(
    systemPrompt: string,
    messages: MessageParam[],
    agentId?: string
  ): Promise<ClaudeResponse>;
}

function extractResponse(response: Anthropic.Message): ClaudeResponse {
  const textBlock = response.content.find((b) => b.type === "text");
  const content = textBlock ? textBlock.text : "";
  return {
    content,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

const DEFAULT_CLAUDE_MODEL = "claude-haiku-4-5-20251001";

function getClaudeModel(): string {
  return process.env.CLAUDE_MODEL ?? DEFAULT_CLAUDE_MODEL;
}

export function createClaudeClient(apiKey?: string): LLMClient {
  const client = new Anthropic({
    apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
  });

  return {
    async sendMessage(
      systemPrompt: string,
      userMessage: string,
      _agentId?: string
    ): Promise<ClaudeResponse> {
      const model = getClaudeModel();
      verbose("Claude API: sendMessage", { model, systemPromptLength: systemPrompt.length, userMessage });
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });
      const result = extractResponse(response);
      verbose("Claude API: response", { contentLength: result.content.length, inputTokens: result.inputTokens, outputTokens: result.outputTokens, content: result.content });
      return result;
    },

    async sendMessages(
      systemPrompt: string,
      messages: MessageParam[],
      _agentId?: string
    ): Promise<ClaudeResponse> {
      const model = getClaudeModel();
      verbose("Claude API: sendMessages", { model, systemPromptLength: systemPrompt.length, messageCount: messages.length });
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
      });
      const result = extractResponse(response);
      verbose("Claude API: response", { contentLength: result.content.length, inputTokens: result.inputTokens, outputTokens: result.outputTokens, content: result.content });
      return result;
    },
  };
}

export function getActiveModel(): string {
  const provider = process.env.LLM_PROVIDER ?? "anthropic";
  if (provider === "ollama") {
    return `ollama/${process.env.OLLAMA_MODEL ?? "llama3.2"}`;
  }
  return getClaudeModel();
}

export function createLLMClient(): LLMClient {
  const provider = process.env.LLM_PROVIDER ?? "anthropic";
  if (provider === "ollama") return createOllamaClient();
  return createClaudeClient();
}
