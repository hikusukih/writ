import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PlanSchema, WorkAssignmentSchema } from "../schemas.js";
import type { LLMClient } from "./claude-client.js";
import type { IOAdapter } from "../io/IOAdapter.js";
import { buildSystemPrompt } from "./prompt-builder.js";
import { getAgentConfig } from "../identity/loader.js";
import { listScripts } from "../scripts/index.js";
import { generateAndPromote } from "./developer-writer.js";
import { applyReview } from "./reviewed.js";
import { callWithValidation } from "./llm-utils.js";
import { verbose } from "../logger.js";
import type { IdentityContext, LieutenantPlanResult, Plan, ScriptInfo, WorkAssignment } from "../types.js";

/** Maximum number of Developer/Writer calls per LP invocation. */
const MAX_DW_CALLS = 3;

/**
 * Produce a detailed, script-level execution plan from a single work assignment.
 * The Lieutenant Planner receives assignments from the General Planner and
 * translates them into concrete script invocations.
 */
export async function createDetailedPlan(
  client: LLMClient,
  assignment: WorkAssignment,
  identity: IdentityContext,
  scriptsDir: string,
  plansDir: string,
  scriptSubset?: ScriptInfo[]
): Promise<LieutenantPlanResult> {
  WorkAssignmentSchema.parse(assignment);

  const agentConfig = getAgentConfig(identity, "lieutenant-planner");
  const systemPrompt = buildSystemPrompt(agentConfig, identity);

  const scripts = scriptSubset ?? (await listScripts(scriptsDir));
  verbose("LieutenantPlanner: available scripts", scripts.map((s) => s.id));

  const scriptIndex = scripts
    .map(
      (s) =>
        `- **${s.id}**: ${s.description}${s.params.length > 0 ? ` (params: ${s.params.join(", ")})` : ""}`
    )
    .join("\n");

  const availableIds = scripts.map((s) => s.id).join(", ");

  const paramHints = scripts
    .filter((s) => s.params.length > 0)
    .map((s) => `  ${s.id}: ${s.params.join(", ")}`)
    .join("\n");

  const constraintBlock = assignment.constraints?.length
    ? `\nConstraints:\n${assignment.constraints.map((c) => `- ${c}`).join("\n")}`
    : "";

  const contextBlock = assignment.context ? `\nContext: ${assignment.context}` : "";

  const userMessage = `Work Assignment [${assignment.id}]: ${assignment.description}
${contextBlock}${constraintBlock}

Available scripts (${availableIds || "none"}):
${scriptIndex || "No scripts available."}

Respond with ONLY raw JSON, no fences, no prose:
{"id":"plan-<slug>","description":"<goal>","steps":[{"description":"<what>","scriptId":"<id>","params":{"KEY":"value"},"order":0}]}

Rules:
- scriptId MUST be one of: ${availableIds || "(none)"} — OR use "__missing__" with a "missingReason" field for scripts that don't exist yet
- If a step needs a file path, default to runtime/<plan-slug>.txt (relative, inside project)
- Do not use absolute paths or placeholders like /path/to/file${paramHints ? `\nParam names by script:\n${paramHints}` : ""}`;

  verbose("LieutenantPlanner: sending plan request", userMessage);

  const plan = await callWithValidation(client, systemPrompt, userMessage, PlanSchema, {
    label: "LieutenantPlanner",
  });

  verbose("LieutenantPlanner: validated plan", plan);

  const missingScripts = detectMissingScripts(plan);
  if (missingScripts.length > 0) {
    verbose("LieutenantPlanner: missing scripts detected", missingScripts);
  }

  const planMd = formatDetailedPlanMd(plan, assignment);
  await writeFile(join(plansDir, `PLAN-${plan.id}.md`), planMd);

  return { plan, missingScripts };
}

/**
 * Scan a plan's steps for __missing__ scriptId entries and extract them
 * as { name, capability } pairs for Developer/Writer to fulfill.
 */
export function detectMissingScripts(
  plan: Plan
): { name: string; capability: string }[] {
  return plan.steps
    .filter((step) => step.scriptId === "__missing__")
    .map((step) => ({
      name: step.params?.SCRIPT_NAME ?? `script-for-step-${step.order}`,
      capability: step.missingReason ?? step.description,
    }));
}

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
export async function createDetailedPlanWithDW(
  client: LLMClient,
  assignment: WorkAssignment,
  identity: IdentityContext,
  scriptsDir: string,
  plansDir: string,
  options: DetailedPlanOptions = {}
): Promise<LieutenantPlanResult> {
  let result = await createDetailedPlan(client, assignment, identity, scriptsDir, plansDir);
  let dwCallCount = 0;

  while (result.missingScripts.length > 0 && dwCallCount < MAX_DW_CALLS) {
    const toCreate = result.missingScripts.slice(0, MAX_DW_CALLS - dwCallCount);
    verbose("LieutenantPlanner: commissioning scripts via DW", toCreate.map((s) => s.name));
    if (options.adapter) await options.adapter.sendProgress("dw", `Developer/Writer: creating ${toCreate.length} missing script${toCreate.length === 1 ? "" : "s"}...`);

    const existingScripts = await listScripts(scriptsDir);

    for (const missing of toCreate) {
      try {
        await generateAndPromote(
          client,
          { capability: missing.capability, existingScripts },
          identity,
          scriptsDir,
          { adapter: options.adapter, onPromote: options.onPromote }
        );
        dwCallCount++;
        verbose("LieutenantPlanner: DW script created", { name: missing.name, dwCallCount });
        if (options.adapter) await options.adapter.sendProgress("dw", `Developer/Writer: script promoted (${dwCallCount}/${MAX_DW_CALLS})`);
      } catch (err) {
        verbose("LieutenantPlanner: DW script creation failed", {
          name: missing.name,
          error: err instanceof Error ? err.message : String(err),
        });
        dwCallCount++;
      }
    }

    // Re-plan with updated script index
    const updatedScripts = await listScripts(scriptsDir);
    result = await createDetailedPlan(client, assignment, identity, scriptsDir, plansDir, updatedScripts);
  }

  if (result.missingScripts.length > 0) {
    verbose("LieutenantPlanner: DW cap reached, remaining missing scripts", result.missingScripts);
  }

  // Review the final plan before returning
  const planJson = JSON.stringify(result.plan, null, 2);
  await applyReview(planJson, identity, {
    client,
    skipReview: options.skipReview,
    subjectAgentId: "lieutenant-planner",
    adapter: options.adapter,
  });

  return result;
}

function formatDetailedPlanMd(plan: Plan, assignment: WorkAssignment): string {
  const lines = [
    `# Detailed Plan: ${plan.id}`,
    "",
    `**Assignment**: ${assignment.id} — ${assignment.description}`,
    "",
    `## Description`,
    plan.description,
    "",
    `## Steps`,
  ];

  for (const step of plan.steps) {
    const isMissing = step.scriptId === "__missing__";
    lines.push(`${step.order + 1}. **${step.description}**`);
    if (isMissing) {
      lines.push(`   - Script: \`__missing__\` — ${step.missingReason ?? "no reason given"}`);
    } else if (step.scriptId) {
      lines.push(`   - Script: \`${step.scriptId}\``);
    }
    if (step.params && Object.keys(step.params).length > 0) {
      const paramStr = Object.entries(step.params)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      lines.push(`   - Params: \`${paramStr}\``);
    }
  }

  return lines.join("\n") + "\n";
}
