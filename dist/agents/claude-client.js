import Anthropic from "@anthropic-ai/sdk";
import { createOllamaClient } from "./ollama-client.js";
import { verbose } from "../logger.js";
const RETRY_DELAYS_MS = [2000, 4000, 8000];
function isRetryable(err) {
    // 429 rate limit or 503 service unavailable
    if (err instanceof Anthropic.RateLimitError)
        return true;
    if (err instanceof Anthropic.InternalServerError)
        return true;
    // Network-level failures (fetch errors, connection resets, etc.)
    if (err instanceof Anthropic.APIConnectionError)
        return true;
    return false;
}
export async function withRetry(fn, maxAttempts = 3) {
    let lastErr;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            if (!isRetryable(err) || attempt === maxAttempts - 1)
                throw err;
            lastErr = err;
            const delayMs = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
            verbose("Claude API: retryable error, backing off", {
                attempt: attempt + 1,
                maxAttempts,
                delayMs,
                error: err instanceof Error ? err.message : String(err),
            });
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }
    throw lastErr;
}
function extractResponse(response) {
    const textBlock = response.content.find((b) => b.type === "text");
    const content = textBlock ? textBlock.text : "";
    return {
        content,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
    };
}
const DEFAULT_CLAUDE_MODEL = "claude-haiku-4-5-20251001";
function getClaudeModel() {
    return process.env.CLAUDE_MODEL ?? DEFAULT_CLAUDE_MODEL;
}
export function createClaudeClient(apiKey) {
    const client = new Anthropic({
        apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
    return {
        async sendMessage(systemPrompt, userMessage) {
            const model = getClaudeModel();
            verbose("Claude API: sendMessage", { model, systemPromptLength: systemPrompt.length, userMessage });
            const response = await withRetry(() => client.messages.create({
                model,
                max_tokens: 4096,
                system: systemPrompt,
                messages: [{ role: "user", content: userMessage }],
            }));
            const result = extractResponse(response);
            verbose("Claude API: response", { contentLength: result.content.length, inputTokens: result.inputTokens, outputTokens: result.outputTokens, content: result.content });
            return result;
        },
        async sendMessages(systemPrompt, messages) {
            const model = getClaudeModel();
            verbose("Claude API: sendMessages", { model, systemPromptLength: systemPrompt.length, messageCount: messages.length });
            const response = await withRetry(() => client.messages.create({
                model,
                max_tokens: 4096,
                system: systemPrompt,
                messages,
            }));
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
    return getClaudeModel();
}
export function createLLMClient(agentId) {
    const provider = process.env.LLM_PROVIDER ?? "anthropic";
    if (provider === "ollama")
        return createOllamaClient(undefined, undefined, agentId);
    return createClaudeClient();
}
