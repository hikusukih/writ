import type { JobExecutor } from "./scheduler.js";
import type { JobStore } from "./store.js";
import type { Job } from "./types.js";
import type { IOAdapter } from "../io/IOAdapter.js";
import type { LLMClient } from "../agents/claude-client.js";
import type { IdentityContext, LieutenantPlanResult, WorkAssignment } from "../types.js";
import { executeFromPlan } from "../agents/executor.js";
import { generateScript } from "../agents/developer-writer.js";
import { createDetailedPlanWithDW } from "../agents/lieutenant-planner.js";
import { createStrategicPlan } from "../agents/planner.js";
import { listScripts } from "../scripts/index.js";

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

export function createDefaultJobExecutor(
  deps: DefaultJobExecutorDeps
): DefaultJobExecutor {
  const { clientFactory, identity, scriptsDir, plansDir, skipReview, getStore } = deps;

  return {
    async execute(job: Job, adapter: IOAdapter | undefined): Promise<unknown> {
      switch (job.type) {
        case "execute_script": {
          let plan = job.plan ?? null;

          // If no plan is directly attached, attempt to resolve it from the first dependency job's result.
          // This supports DAG submission where the execute job is created before the plan job completes.
          if (!plan && job.dependsOn.length > 0 && getStore) {
            const store = getStore();
            const depJob = await store.getJob(job.dependsOn[0]);
            if (depJob?.result) {
              const lpResult = depJob.result as LieutenantPlanResult;
              plan = lpResult.plan ?? null;
            }
          }

          if (!plan) {
            throw new Error(`Job "${job.id}" (execute_script) requires a plan but none was provided`);
          }
          return executeFromPlan(plan, scriptsDir, plansDir);
        }

        case "develop_script": {
          const existingScripts = await listScripts(scriptsDir);
          return generateScript(
            clientFactory("developer-writer"),
            { capability: job.goal, existingScripts },
            identity
          );
        }

        case "plan": {
          const assignment: WorkAssignment = {
            id: job.id,
            description: job.goal,
          };
          return createDetailedPlanWithDW(clientFactory("lieutenant-planner"), assignment, identity, scriptsDir, plansDir, {
            adapter,
            skipReview,
          });
        }

        case "notify_user": {
          await adapter?.sendResult(job.goal, "");
          return { notified: true, message: job.goal };
        }

        case "replan": {
          return createStrategicPlan(clientFactory("planner"), job.goal, identity, plansDir);
        }

        case "initiative_setup": {
          throw new Error("initiative_setup: not implemented (InitiativeBuilder does not exist yet)");
        }

        default: {
          throw new Error(`Unknown job type: "${(job as Job).type}"`);
        }
      }
    },
  };
}
