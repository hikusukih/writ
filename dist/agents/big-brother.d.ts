import type { LLMClient } from "./claude-client.js";
import type { IOAdapter } from "../io/IOAdapter.js";
import type { BBInput, BBOutput, IdentityContext, ViolationSummary } from "../types.js";
/**
 * Propose config updates to address a constitutional violation.
 */
export declare function proposeConfigUpdate(client: LLMClient, input: BBInput, identity: IdentityContext): Promise<BBOutput>;
export interface ApplyConfigOptions {
    /** Called after a config is written — use to trigger resetOnContextChange() */
    onConfigWrite?: (agentId: string) => void;
}
/**
 * Review BB's proposed changes and apply them if approved.
 * Returns true if changes were applied, false if rejected.
 */
export declare function applyConfigUpdate(client: LLMClient, bbOutput: BBOutput, violation: ViolationSummary, identity: IdentityContext, adapter: IOAdapter | undefined, identityDir: string, runtimeDir: string, options?: ApplyConfigOptions): Promise<boolean>;
/**
 * Entry point called by Reviewer-Reviewer when a constitutional inconsistency is flagged.
 * Loads relevant configs, proposes updates, reviews them, and applies if approved.
 */
export declare function triggerBigBrother(violation: ViolationSummary, client: LLMClient, identity: IdentityContext, adapter: IOAdapter | undefined, identityDir: string, runtimeDir: string): Promise<void>;
