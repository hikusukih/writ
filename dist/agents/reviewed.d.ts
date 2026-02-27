import type { AgentOutput, IdentityContext } from "../types.js";
export type AgentFn = (input: string) => Promise<AgentOutput>;
export type HaltCallback = (reasoning: string, output: string) => Promise<boolean>;
export declare function withReview(agentFn: AgentFn, identity: IdentityContext, onHalt?: HaltCallback): AgentFn;
export declare class ReviewHaltError extends Error {
    readonly reasoning: string;
    readonly flaggedOutput: string;
    readonly matchedRules?: string[] | undefined;
    constructor(reasoning: string, flaggedOutput: string, matchedRules?: string[] | undefined);
}
