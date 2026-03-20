import type { LLMClient, MessageParam } from "./claude-client.js";
import type { IOAdapter } from "../io/IOAdapter.js";
import type { Scheduler } from "../jobs/scheduler.js";
import type { ExecutionResult, IdentityContext, OrchestratorResult, ScriptResult } from "../types.js";
/** Build a compact side-effect summary from execution results for conversation history */
export declare function buildSideEffectSummary(executionResults: ExecutionResult[]): string;
/** Build the orchestrator prompt for a user request */
export declare function buildInterpretPrompt(userInput: string): string;
/** Build the prompt for the final response-generation LLM call */
export declare function buildResponsePrompt(userInput: string, taskDescription: string, strategicDescription: string, allResults: ScriptResult[]): string;
/**
 * Options for throbber timeout behaviour.
 * When a job takes longer than the timeout, the orchestrator sends an
 * acknowledgment and delivers the result asynchronously via adapter.sendResult().
 */
export interface OrchestratorOptions {
    /** Default throbber timeout in ms. Defaults to 10 000 ms. */
    throbberTimeoutMs?: number;
    /** Per-job-type overrides for the throbber timeout. */
    jobTypeTimeouts?: Partial<Record<string, number>>;
}
export declare function handleRequest(client: LLMClient, userInput: string, identity: IdentityContext, scriptsDir: string, plansDir: string, history?: MessageParam[], skipReview?: boolean, adapter?: IOAdapter, scheduler?: Scheduler, options?: OrchestratorOptions): Promise<OrchestratorResult>;
