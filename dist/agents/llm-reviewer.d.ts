import type { LLMClient } from "./claude-client.js";
import type { IdentityContext, ReviewResult } from "../types.js";
/**
 * Review content using an LLM (Claude). Falls back to rule-based reviewer
 * if the LLM call or response parsing fails after retries.
 */
export declare function reviewWithLLM(content: string, subjectAgentId: string, identity: IdentityContext, client: LLMClient, reviewerConfig?: string, antiPatterns?: string, logsDir?: string): Promise<ReviewResult>;
