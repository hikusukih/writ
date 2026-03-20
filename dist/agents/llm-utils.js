import { verbose } from "../logger.js";
/**
 * Extract a JSON string from LLM output that may be wrapped in markdown fences.
 */
export function extractJson(text) {
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch)
        return fenceMatch[1].trim();
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch)
        return braceMatch[0];
    return text.trim();
}
/**
 * Send a message to an LLM and validate the JSON response against a Zod schema.
 * Retries on parse/validation failure, feeding the error back to the LLM for self-correction.
 *
 * @returns The validated, typed result
 * @throws The original validation error after all retries are exhausted
 */
export async function callWithValidation(client, systemPrompt, userMessage, schema, options = {}) {
    const { maxRetries = 2, label = "LLM call" } = options;
    const totalAttempts = maxRetries + 1;
    let lastError;
    let currentMessage = userMessage;
    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
        try {
            verbose(`${label}: attempt ${attempt}/${totalAttempts}`);
            const response = await client.sendMessage(systemPrompt, currentMessage);
            const jsonStr = extractJson(response.content);
            const parsed = JSON.parse(jsonStr);
            return schema.parse(parsed);
        }
        catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            verbose(`${label}: attempt ${attempt} failed`, lastError.message);
            if (attempt < totalAttempts) {
                currentMessage = `${userMessage}\n\nYour previous response failed validation: ${lastError.message}. Please try again with valid JSON.`;
            }
        }
    }
    throw lastError;
}
