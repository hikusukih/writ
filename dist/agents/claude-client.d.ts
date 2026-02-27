import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.js";
export type { MessageParam };
export interface ClaudeResponse {
    content: string;
    inputTokens: number;
    outputTokens: number;
}
export interface LLMClient {
    sendMessage(systemPrompt: string, userMessage: string): Promise<ClaudeResponse>;
    sendMessages(systemPrompt: string, messages: MessageParam[]): Promise<ClaudeResponse>;
}
export declare function createClaudeClient(apiKey?: string): LLMClient;
export declare function getActiveModel(): string;
export declare function createLLMClient(): LLMClient;
