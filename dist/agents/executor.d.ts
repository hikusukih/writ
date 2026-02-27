import type { ExecutionResult, Plan } from "../types.js";
export declare function executeFromPlan(plan: Plan, scriptsDir: string, plansDir: string): Promise<ExecutionResult>;
