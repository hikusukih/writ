import type { Plan } from "../types.js";
export type JobType = "execute_script" | "develop_script" | "plan" | "notify_user" | "replan" | "initiative_setup";
export type JobStatus = "pending" | "blocked" | "running" | "completed" | "failed";
export type CallbackAction = "create_job" | "notify_orchestrator" | "notify_planner" | "update_initiative";
export interface Callback {
    on: "complete" | "fail";
    action: CallbackAction;
    payload?: Record<string, unknown>;
}
export interface StatementRef {
    statementId: string;
    relationship: "motivates" | "constrains" | "supersedes_prior";
}
export interface Job {
    id: string;
    type: JobType;
    status: JobStatus;
    goal: string;
    dependsOn: string[];
    createdBy: string;
    plan?: Plan | null;
    result?: unknown;
    evidence: StatementRef[];
    callbacks: Callback[];
    channel: string[];
    timestamps: {
        created: string;
        started?: string;
        completed?: string;
    };
}
