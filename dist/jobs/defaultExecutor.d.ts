import type { JobExecutor } from "./scheduler.js";
import type { JobStore } from "./store.js";
import type { Job } from "./types.js";
import type { IOAdapter } from "../io/IOAdapter.js";
import type { LLMClient } from "../agents/claude-client.js";
import type { IdentityContext } from "../types.js";
export interface DefaultJobExecutorDeps {
    clientFactory: (agentId: string) => LLMClient;
    identity: IdentityContext;
    scriptsDir: string;
    plansDir: string;
    skipReview?: boolean;
    /** Optional store accessor so execute_script jobs can resolve their plan from a dependency job result */
    getStore?: () => JobStore;
}
export interface DefaultJobExecutor extends JobExecutor {
    execute(job: Job, adapter: IOAdapter | undefined): Promise<unknown>;
}
export declare function createDefaultJobExecutor(deps: DefaultJobExecutorDeps): DefaultJobExecutor;
