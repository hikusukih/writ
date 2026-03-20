import type { ZodSchema } from "zod";
import type { LLMClient } from "./claude-client.js";
/**
 * Extract a JSON string from LLM output that may be wrapped in markdown fences.
 */
export declare function extractJson(text: string): string;
export interface CallWithValidationOptions {
    maxRetries?: number;
    label?: string;
}
/**
 * Send a message to an LLM and validate the JSON response against a Zod schema.
 * Retries on parse/validation failure, feeding the error back to the LLM for self-correction.
 *
 * @returns The validated, typed result
 * @throws The original validation error after all retries are exhausted
 */
export declare function callWithValidation<T>(client: LLMClient, systemPrompt: string, userMessage: string, schema: ZodSchema<T>, options?: CallWithValidationOptions): Promise<T>;
