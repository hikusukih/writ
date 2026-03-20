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
export declare function handleRequest(client: LLMClient, userInput: string, identity: IdentityContext, scriptsDir: string, plansDir: string, history?: MessageParam[], skipReview?: boolean, adapter?: IOAdapter, scheduler?: Scheduler): Promise<OrchestratorResult>;
