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

export async function handleRequest(
  client: LLMClient,
  userInput: string,
  identity: IdentityContext,
  scriptsDir: string,
  plansDir: string,
  history?: MessageParam[],
  skipReview?: boolean,
  adapter?: IOAdapter,
  scheduler?: Scheduler
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
      ])
    : await client.sendMessage(systemPrompt, currentMessage);

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
    const executor = createDefaultJobExecutor({ client, identity, scriptsDir, plansDir, skipReview });
    activeScheduler = createScheduler(store, executor, adapter);
  }

  // Step 3: For each assignment, route LP + execute through the scheduler
  const allExecutionResults: ExecutionResult[] = [];
  const allResults: ScriptResult[] = [];

  try {
    for (const assignment of strategicPlan.assignments) {
      verbose("Orchestrator: processing assignment via scheduler", { id: assignment.id, description: assignment.description });

      // Submit a "plan" job for the Lieutenant Planner (includes DW integration)
      const planJob = await activeScheduler.submitJob({
        type: "plan",
        goal: assignment.description,
        dependsOn: [],
        createdBy: "orchestrator",
        evidence: [],
        callbacks: [],
        channel: [],
      });

      await activeScheduler.tick();
      const completedPlanJob = await activeScheduler.waitForJob(planJob.id);

      if (completedPlanJob.status === "failed") {
        const errMsg = (completedPlanJob.result as { error?: string } | undefined)?.error ?? "unknown error";
        throw new Error(`Plan job for assignment ${assignment.id} failed: ${errMsg}`);
      }

      const lpResult = completedPlanJob.result as LieutenantPlanResult;

      provenance.push({
        agentId: "lieutenant-planner",
        action: `created detailed plan ${lpResult.plan.id} for assignment ${assignment.id}`,
        output: lpResult.plan.description,
      });

      // Submit an "execute_script" job with the plan from LP
      verbose("Orchestrator: executing plan via scheduler", { planId: lpResult.plan.id, steps: lpResult.plan.steps.length });
      const execJob = await activeScheduler.submitJob({
        type: "execute_script",
        goal: `Execute plan ${lpResult.plan.id}`,
        plan: lpResult.plan,
        dependsOn: [],
        createdBy: "orchestrator",
        evidence: [],
        callbacks: [],
        channel: [],
      });

      await activeScheduler.tick();
      const completedExecJob = await activeScheduler.waitForJob(execJob.id);

      if (completedExecJob.status === "failed") {
        const errMsg = (completedExecJob.result as { error?: string } | undefined)?.error ?? "unknown error";
        throw new Error(`Execute job for plan ${lpResult.plan.id} failed: ${errMsg}`);
      }

      const executionResult = completedExecJob.result as ExecutionResult;

      verbose("Orchestrator: execution results", executionResult.results);
      const scriptsSummary = executionResult.results
        .map((r) => `${r.scriptId}: exit=${r.exitCode}`)
        .join(", ");
      provenance.push({
        agentId: "executor",
        action: `executed plan ${lpResult.plan.id}`,
        output: scriptsSummary,
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
  const responseContent = await client.sendMessage(systemPrompt, responsePrompt);
  const response = responseContent.content.trim();
  verbose("Orchestrator: response generated", { response });

  // Review the final response before returning to caller
  await applyReview(response, identity, { client, skipReview, adapter, subjectAgentId: "orchestrator" });

  const sideEffects = buildSideEffectSummary(allExecutionResults);

  return { response, provenance, sideEffects: sideEffects || undefined };
}
