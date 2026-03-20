import type { JobExecutor } from "./scheduler.js";
import type { Job } from "./types.js";
import type { IOAdapter } from "../io/IOAdapter.js";
import type { LLMClient } from "../agents/claude-client.js";
import type { IdentityContext } from "../types.js";
export interface DefaultJobExecutorDeps {
    client: LLMClient;
    identity: IdentityContext;
    scriptsDir: string;
    plansDir: string;
    skipReview?: boolean;
}
export interface DefaultJobExecutor extends JobExecutor {
    execute(job: Job, adapter: IOAdapter | undefined): Promise<unknown>;
}
export declare function createDefaultJobExecutor(deps: DefaultJobExecutorDeps): DefaultJobExecutor;
