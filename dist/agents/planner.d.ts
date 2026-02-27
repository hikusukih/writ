import type { LLMClient } from "./claude-client.js";
import type { IdentityContext, Plan, ScriptInfo } from "../types.js";
export declare function createPlan(client: LLMClient, taskDescription: string, identity: IdentityContext, scriptsDir: string, plansDir: string, scriptSubset?: ScriptInfo[]): Promise<Plan>;
