import type { AgentClass, AgentOutput, IdentityContext, SamplingRateState } from "../types.js";
import type { LLMClient } from "./claude-client.js";
import type { IOAdapter } from "../io/IOAdapter.js";
export interface SamplingContext {
    state: SamplingRateState;
    agentClass: AgentClass;
    onUpdate: (newState: SamplingRateState) => void;
}
export interface ReviewOptions {
    client?: LLMClient;
    skipReview?: boolean;
    adapter?: IOAdapter;
    subjectAgentId?: string;
    logsDir?: string;
    sampling?: SamplingContext;
}
/**
 * Apply review to a string output, throwing ReviewHaltError if flagged.
 * When a LLMClient is provided, uses LLM-based review; otherwise falls back to rule-based.
 *
 * FAFC decisions route through HJA when an adapter is provided.
 * Without an adapter, FAFC falls back to halt behavior (backward compat).
 */
export declare function applyReview(content: string, identity: IdentityContext, options?: ReviewOptions): Promise<void>;
export type AgentFn = (input: string) => Promise<AgentOutput>;
export type HaltCallback = (reasoning: string, output: string) => Promise<boolean>;
export declare function withReview(agentFn: AgentFn, identity: IdentityContext, onHalt?: HaltCallback): AgentFn;
export declare class ReviewHaltError extends Error {
    readonly reasoning: string;
    readonly flaggedOutput: string;
    readonly matchedRules?: string[] | undefined;
    constructor(reasoning: string, flaggedOutput: string, matchedRules?: string[] | undefined);
}
