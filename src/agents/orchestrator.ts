import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { LLMClient, MessageParam } from "./claude-client.js";
import { buildSystemPrompt } from "./prompt-builder.js";
import { getAgentConfig } from "../identity/loader.js";
import { createStrategicPlan } from "./planner.js";
import { applyReview } from "./reviewed.js";
import { verbose } from "../logger.js";
import type { IOAdapter } from "../io/IOAdapter.js";
import type { Job } from "../jobs/types.js";
import type { Scheduler } from "../jobs/scheduler.js";
import { createScheduler } from "../jobs/scheduler.js";
import { createJobStore } from "../jobs/store.js";
import { createDefaultJobExecutor } from "../jobs/defaultExecutor.js";
import type {
  ExecutionResult,
  IdentityContext,
  LieutenantPlanResult,
  OrchestratorResult,
  ProvenanceEntry,
  ScriptResult,
} from "../types.js";

/** Build a compact side-effect summary from execution results for conversation history */
export function buildSideEffectSummary(executionResults: ExecutionResult[]): string {
  const allParts: string[] = [];
  for (const executionResult of executionResults) {
    for (const r of executionResult.results) {
      const step = executionResult.instructionFile.steps.find((s) => s.scriptId === r.scriptId);
      const paramsStr = step
        ? Object.entries(step.params)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")
        : "";
      const status = r.exitCode === 0 ? "ok" : `exit ${r.exitCode}`;
      allParts.push(paramsStr ? `${r.scriptId}(${paramsStr}) → ${status}` : `${r.scriptId} → ${status}`);
    }
  }
  return allParts.join("; ");
}

/** Build the orchestrator prompt for a user request */
export function buildInterpretPrompt(userInput: string): string {
  return `Restate the following user request as a single plain-English sentence describing what needs to be done. No bullet points, no headers, no preamble — one sentence only.

Request: "${userInput}"`;
}

/** Build the prompt for the final response-generation LLM call */
export function buildResponsePrompt(
  userInput: string,
  taskDescription: string,
  strategicDescription: string,
  allResults: ScriptResult[]
): string {
  if (allResults.length === 0) {
    return `The user asked: "${userInput}"
You interpreted this as: "${taskDescription}"
A strategic plan was created (${strategicDescription}) but no scripts could be executed because the required scripts are not in the library.

Provide a brief, natural-language response explaining this to the user.`;
  }

  const resultLines = allResults
    .map((r) => {
      const status = r.exitCode === 0 ? "succeeded" : `failed (exit ${r.exitCode})`;
      const output = r.stdout || r.stderr || "(no output)";
      return `- ${r.scriptId}: ${status}\n  Output: ${output}`;
    })
    .join("\n");

  return `The user asked: "${userInput}"
You interpreted this as: "${taskDescription}"
Strategic plan: ${strategicDescription}

Script execution results:
${resultLines}

Provide a brief, natural-language response to the user summarizing what was done and what the results mean. Be concise and helpful.`;
}

/**
 * Options for throbber timeout behaviour.
 * When a job takes longer than the timeout, the orchestrator sends an
 * acknowledgment and delivers the result asynchronously via adapter.sendResult().
 */
export interface OrchestratorOptions {
  /** Default throbber timeout in ms. Defaults to 10 000 ms. */
  throbberTimeoutMs?: number;
  /** Per-job-type overrides for the throbber timeout. */
  jobTypeTimeouts?: Partial<Record<string, number>>;
}

export async function handleRequest(
  client: LLMClient,
  userInput: string,
  identity: IdentityContext,
  scriptsDir: string,
  plansDir: string,
  history?: MessageParam[],
  skipReview?: boolean,
  adapter?: IOAdapter,
  scheduler?: Scheduler,
  options?: OrchestratorOptions
): Promise<OrchestratorResult> {
  const provenance: ProvenanceEntry[] = [];

  // Step 1: Orchestrator interprets user intent
  const orchestratorConfig = getAgentConfig(identity, "orchestrator");
  const systemPrompt = buildSystemPrompt(orchestratorConfig, identity);

  const currentMessage = buildInterpretPrompt(userInput);

  verbose("Orchestrator: sending interpret request", {
    historyLength: history?.length ?? 0,
    history: history ?? [],
    message: currentMessage,
  });

  const interpretResponse = history && history.length > 0
    ? await client.sendMessages(systemPrompt, [
        ...history,
        { role: "user", content: currentMessage },
      ], "orchestrator")
    : await client.sendMessage(systemPrompt, currentMessage, "orchestrator");

  const taskDescription = interpretResponse.content.trim();
  verbose("Orchestrator: task description", taskDescription);

  // Review the orchestrator's interpretation before passing to planner
  await applyReview(taskDescription, identity, { client, skipReview, adapter, subjectAgentId: "orchestrator" });

  provenance.push({
    agentId: "orchestrator",
    action: "interpreted user request",
    output: taskDescription,
  });

  // Step 2: General Planner creates a strategic plan (work assignments)
  verbose("Orchestrator: calling general planner", taskDescription);
  const strategicPlan = await createStrategicPlan(
    client,
    taskDescription,
    identity,
    plansDir
  );

  verbose("Orchestrator: strategic plan created", strategicPlan);
  provenance.push({
    agentId: "planner",
    action: `created strategic plan ${strategicPlan.id}`,
    output: strategicPlan.description,
  });

  // Resolve the scheduler: use provided one or create an ephemeral in-process scheduler
  let activeScheduler = scheduler;
  let tmpJobsDir: string | undefined;
  if (!activeScheduler) {
    const dir = await mkdtemp(join(tmpdir(), "writ-orch-jobs-"));
    tmpJobsDir = dir;
    const store = await createJobStore(dir);
    const executor = createDefaultJobExecutor({
      client,
      identity,
      scriptsDir,
      plansDir,
      skipReview,
      getStore: () => store,
    });
    activeScheduler = createScheduler(store, executor, adapter);
  }

  // Channel from the originating adapter — used for all jobs created in this request
  const channel = adapter?.getChannel() ?? [];

  // Step 3: Submit all jobs as a DAG upfront, then let the scheduler handle ordering.
  //
  // For each assignment we create two jobs:
  //   plan job  →  execute job (depends on plan job)
  //
  // The execute job has no plan attached at submission time; DefaultJobExecutor
  // will resolve it from the plan job's result when the execute job runs.
  //
  // This allows multiple assignments to run their planning phases in parallel,
  // and their execution phases in parallel once planning completes.
  const allExecutionResults: ExecutionResult[] = [];
  const allResults: ScriptResult[] = [];

  // Throbber state — must be outside try so it's accessible in the finally/post-try section
  const throbberMs = options?.throbberTimeoutMs ?? 10_000;
  let sentAck = false;

  try {
    type JobPair = { planJob: Job; execJob: Job };
    const jobPairs: JobPair[] = [];

    for (const assignment of strategicPlan.assignments) {
      verbose("Orchestrator: submitting jobs for assignment", {
        id: assignment.id,
        description: assignment.description,
      });

      const planJob = await activeScheduler.submitJob({
        type: "plan",
        goal: assignment.description,
        dependsOn: [],
        createdBy: "orchestrator",
        evidence: [],
        callbacks: [],
        channel,
      });

      // Execute job depends on the plan job so the scheduler runs them in order.
      // The plan is resolved at runtime from the plan job's result.
      const execJob = await activeScheduler.submitJob({
        type: "execute_script",
        goal: `Execute plan for: ${assignment.description}`,
        dependsOn: [planJob.id],
        createdBy: "orchestrator",
        evidence: [],
        callbacks: [],
        channel,
        // plan deliberately omitted — resolved by DefaultJobExecutor from dependency result
      });

      jobPairs.push({ planJob, execJob });
    }

    // Start the scheduler run loop in the background. It ticks until all jobs finish.
    activeScheduler.run().catch((err) => {
      verbose("Orchestrator: scheduler run error (non-blocking)", err instanceof Error ? err.message : String(err));
    });

    // Throbber timeout: race each waitForJob() against the configured timeout.
    // On the first timeout, send an acknowledgment and continue waiting.
    // If we sent an ack, deliver the final result asynchronously via adapter.sendResult().
    async function waitWithThrobber(jobId: string, jobType: string): Promise<Job> {
      const timeout = options?.jobTypeTimeouts?.[jobType] ?? throbberMs;

      try {
        return await Promise.race([
          activeScheduler!.waitForJob(jobId, 300_000),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("__throbber_timeout__")), timeout)
          ),
        ]);
      } catch (err) {
        if (err instanceof Error && err.message === "__throbber_timeout__") {
          if (!sentAck && adapter) {
            sentAck = true;
            await adapter.sendAcknowledgment("Working on it, I'll follow up when done");
          }
          // Wait for real completion — no additional throbber timeout from here
          return activeScheduler!.waitForJob(jobId, 300_000);
        }
        throw err;
      }
    }

    // Wait for all exec jobs and collect results
    for (const { planJob, execJob } of jobPairs) {
      const completedExecJob = await waitWithThrobber(execJob.id, execJob.type);

      if (completedExecJob.status === "failed") {
        const errMsg = (completedExecJob.result as { error?: string } | undefined)?.error ?? "unknown error";
        throw new Error(`Execute job ${execJob.id} failed: ${errMsg}`);
      }

      // Look up the completed plan job for provenance
      const completedPlanJob = await activeScheduler.getStore().getJob(planJob.id);
      if (completedPlanJob?.status === "failed") {
        const errMsg = (completedPlanJob.result as { error?: string } | undefined)?.error ?? "unknown error";
        throw new Error(`Plan job ${planJob.id} failed: ${errMsg}`);
      }

      const lpResult = completedPlanJob?.result as LieutenantPlanResult | undefined;
      if (!lpResult) {
        throw new Error(`Plan job ${planJob.id} completed but has no result`);
      }

      provenance.push({
        agentId: "lieutenant-planner",
        action: `created detailed plan ${lpResult.plan.id}`,
        output: lpResult.plan.description,
        jobId: planJob.id,
      });

      const executionResult = completedExecJob.result as ExecutionResult;
      verbose("Orchestrator: execution results", executionResult.results);

      const scriptsSummary = executionResult.results
        .map((r) => `${r.scriptId}: exit=${r.exitCode}`)
        .join(", ");

      provenance.push({
        agentId: "executor",
        action: `executed plan ${lpResult.plan.id}`,
        output: scriptsSummary,
        jobId: execJob.id,
        parentJobId: planJob.id,
      });

      allExecutionResults.push(executionResult);
      allResults.push(...executionResult.results);
    }
  } finally {
    if (tmpJobsDir) {
      await rm(tmpJobsDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  // Step 4: Generate natural-language response
  const responsePrompt = buildResponsePrompt(
    userInput,
    taskDescription,
    strategicPlan.description,
    allResults
  );
  verbose("Orchestrator: sending response-generation request", { responsePrompt });
  const responseContent = await client.sendMessage(systemPrompt, responsePrompt, "orchestrator");
  const response = responseContent.content.trim();
  verbose("Orchestrator: response generated", { response });

  // Review the final response before returning to caller
  await applyReview(response, identity, { client, skipReview, adapter, subjectAgentId: "orchestrator" });

  const sideEffects = buildSideEffectSummary(allExecutionResults);

  // If we already sent an acknowledgment, deliver the result asynchronously via the adapter
  // so the user gets the final response even though the REPL already moved on.
  if (sentAck && adapter) {
    const chain = provenance.map((p) => p.agentId).join(" → ");
    await adapter.sendResult(response, chain);
  }

  return {
    response,
    provenance,
    sideEffects: sideEffects || undefined,
    didAck: sentAck || undefined,
  };
}
