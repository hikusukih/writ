import type { LLMClient } from "./claude-client.js";
import type { IdentityContext, Plan, ScriptInfo, StrategicPlan } from "../types.js";
export declare function createPlan(client: LLMClient, taskDescription: string, identity: IdentityContext, scriptsDir: string, plansDir: string, scriptSubset?: ScriptInfo[]): Promise<Plan>;
/**
 * Produce a high-level strategic plan that partitions work into assignments.
 * The General Planner identifies what needs to happen; the Lieutenant Planner
 * determines how (which scripts, in what order).
 */
export declare function createStrategicPlan(client: LLMClient, taskDescription: string, identity: IdentityContext, plansDir: string): Promise<StrategicPlan>;
