import Anthropic from "@anthropic-ai/sdk";
import { createOllamaClient } from "./ollama-client.js";
import { verbose } from "../logger.js";
function extractResponse(response) {
    const textBlock = response.content.find((b) => b.type === "text");
    const content = textBlock ? textBlock.text : "";
    return {
        content,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
    };
}
export function createClaudeClient(apiKey) {
    const client = new Anthropic({
        apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
    return {
        async sendMessage(systemPrompt, userMessage) {
            verbose("Claude API: sendMessage", { model: "claude-sonnet-4-20250514", systemPromptLength: systemPrompt.length, userMessage });
            const response = await client.messages.create({
                model: "claude-sonnet-4-20250514",
                max_tokens: 4096,
                system: systemPrompt,
                messages: [{ role: "user", content: userMessage }],
            });
            const result = extractResponse(response);
            verbose("Claude API: response", { contentLength: result.content.length, inputTokens: result.inputTokens, outputTokens: result.outputTokens, content: result.content });
            return result;
        },
        async sendMessages(systemPrompt, messages) {
            verbose("Claude API: sendMessages", { model: "claude-sonnet-4-20250514", systemPromptLength: systemPrompt.length, messageCount: messages.length });
            const response = await client.messages.create({
                model: "claude-sonnet-4-20250514",
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
export function getActiveModel() {
    const provider = process.env.LLM_PROVIDER ?? "anthropic";
    if (provider === "ollama") {
        return `ollama/${process.env.OLLAMA_MODEL ?? "llama3.2"}`;
    }
    return "claude-sonnet-4-20250514";
}
export function createLLMClient() {
    const provider = process.env.LLM_PROVIDER ?? "anthropic";
    if (provider === "ollama")
        return createOllamaClient();
    return createClaudeClient();
}
