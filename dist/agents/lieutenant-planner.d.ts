import type { LLMClient } from "./claude-client.js";
import type { IOAdapter } from "../io/IOAdapter.js";
import type { IdentityContext, LieutenantPlanResult, Plan, ScriptInfo, WorkAssignment } from "../types.js";
/**
 * Produce a detailed, script-level execution plan from a single work assignment.
 * The Lieutenant Planner receives assignments from the General Planner and
 * translates them into concrete script invocations.
 */
export declare function createDetailedPlan(client: LLMClient, assignment: WorkAssignment, identity: IdentityContext, scriptsDir: string, plansDir: string, scriptSubset?: ScriptInfo[]): Promise<LieutenantPlanResult>;
/**
 * Scan a plan's steps for __missing__ scriptId entries and extract them
 * as { name, capability } pairs for Developer/Writer to fulfill.
 */
export declare function detectMissingScripts(plan: Plan): {
    name: string;
    capability: string;
}[];
export interface DetailedPlanOptions {
    adapter?: IOAdapter;
    skipReview?: boolean;
    onPromote?: () => void;
}
/**
 * Full LP pipeline: generate plan → detect missing scripts → commission via DW → re-plan.
 * Caps DW calls at MAX_DW_CALLS to prevent runaway script generation.
 * Returns a LieutenantPlanResult with no missing scripts (all fulfilled or capped).
 */
export declare function createDetailedPlanWithDW(client: LLMClient, assignment: WorkAssignment, identity: IdentityContext, scriptsDir: string, plansDir: string, options?: DetailedPlanOptions): Promise<LieutenantPlanResult>;
