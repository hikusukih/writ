import type { LLMClient } from "./claude-client.js";
import type { IdentityContext, SemanticReviewResult } from "../types.js";
export interface SemanticReviewConfig {
    enabled: boolean;
    mode: "always" | "sampling" | "fast-path-only";
}
/**
 * Determine whether semantic review should run based on config.
 */
export declare function shouldSemanticReview(config: SemanticReviewConfig): boolean;
/**
 * Run semantic review on a composed script against its plan description.
 */
export declare function semanticReview(client: LLMClient, composedScript: string, planDescription: string, identity: IdentityContext): Promise<SemanticReviewResult>;
export declare class SemanticReviewError extends Error {
    readonly result: SemanticReviewResult;
    constructor(result: SemanticReviewResult);
}
