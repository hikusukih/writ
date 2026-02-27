import type { LLMClient, MessageParam } from "./claude-client.js";
import type { IdentityContext, OrchestratorResult } from "../types.js";
/** Build the orchestrator prompt for a user request */
export declare function buildInterpretPrompt(userInput: string): string;
export declare function handleRequest(client: LLMClient, userInput: string, identity: IdentityContext, scriptsDir: string, plansDir: string, history?: MessageParam[]): Promise<OrchestratorResult>;
