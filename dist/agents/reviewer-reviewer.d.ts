import type { LLMClient } from "./claude-client.js";
import type { IOAdapter } from "../io/IOAdapter.js";
import type { IdentityContext, RRInput, RROutput } from "../types.js";
/**
 * Audit a single reviewer decision for constitutional consistency.
 */
export declare function auditReviewDecision(client: LLMClient, input: RRInput, identity: IdentityContext): Promise<RROutput>;
export interface SampleAndAuditOptions {
    identityDir?: string;
    runtimeDir?: string;
}
/**
 * Sample one review log entry and audit it via the Reviewer-Reviewer.
 *
 * @param sampleRate - Probability (0–1) of sampling. 1 = always, 0 = never.
 * @returns The RR audit result, or null if no sample was taken.
 */
export declare function sampleAndAudit(client: LLMClient, identity: IdentityContext, adapter: IOAdapter | undefined, logsDir: string, sampleRate: number, options?: SampleAndAuditOptions): Promise<RROutput | null>;
