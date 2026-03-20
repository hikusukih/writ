import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PlanSchema, StrategicPlanSchema } from "../schemas.js";
import { buildSystemPrompt } from "./prompt-builder.js";
import { getAgentConfig } from "../identity/loader.js";
import { listScripts } from "../scripts/index.js";
import { callWithValidation } from "./llm-utils.js";
import { verbose } from "../logger.js";
export async function createPlan(client, taskDescription, identity, scriptsDir, plansDir, scriptSubset) {
    const agentConfig = getAgentConfig(identity, "planner");
    const systemPrompt = buildSystemPrompt(agentConfig, identity);
    // Read the full script index directly, unless caller provides a curated subset
    const scripts = scriptSubset ?? (await listScripts(scriptsDir));
    verbose("Planner: available scripts", scripts.map((s) => s.id));
    const scriptIndex = scripts
        .map((s) => `- **${s.id}**: ${s.description}${s.params.length > 0 ? ` (params: ${s.params.join(", ")})` : ""}`)
        .join("\n");
    const availableIds = scripts.map((s) => s.id).join(", ");
    // Build per-script param hints for inline reference
    const paramHints = scripts
        .filter((s) => s.params.length > 0)
        .map((s) => `  ${s.id}: ${s.params.join(", ")}`)
        .join("\n");
    const userMessage = `Task: ${taskDescription}

Scripts (${availableIds || "none"}):
${scriptIndex || "No scripts available."}

Respond with ONLY raw JSON, no fences, no prose:
{"id":"plan-<slug>","description":"<goal>","steps":[{"description":"<what>","scriptId":"<id>","params":{"KEY":"value"},"order":0}]}

Rules:
- scriptId MUST be one of: ${availableIds || "(none)"} — no other values exist
- If a step needs a file path, default to runtime/<plan-slug>.txt (relative, inside project)
- Do not use absolute paths or placeholders like /path/to/file${paramHints ? `\nParam names by script:\n${paramHints}` : ""}`;
    verbose("Planner: sending plan request", userMessage);
    const plan = await callWithValidation(client, systemPrompt, userMessage, PlanSchema, {
        label: "Planner",
    });
    verbose("Planner: validated plan", plan);
    // Write natural language plan to disk for auditability
    const planMd = formatPlanMd(plan);
    await writeFile(join(plansDir, `PLAN-${plan.id}.md`), planMd);
    return plan;
}
/**
 * Produce a high-level strategic plan that partitions work into assignments.
 * The General Planner identifies what needs to happen; the Lieutenant Planner
 * determines how (which scripts, in what order).
 */
export async function createStrategicPlan(client, taskDescription, identity, plansDir) {
    const agentConfig = getAgentConfig(identity, "planner");
    const systemPrompt = buildSystemPrompt(agentConfig, identity);
    const userMessage = `Task: ${taskDescription}

Respond with ONLY raw JSON, no fences, no prose:
{"id":"strategic-<slug>","description":"<high-level goal>","assignments":[{"id":"assign-<n>","description":"<bounded piece of work>","context":"<optional context>","constraints":["optional constraint"]}]}

Rules:
- Partition the task into bounded, independent work assignments
- Each assignment should be completable by a tactical planner without knowledge of the other assignments
- Do NOT reference specific scripts — that's the tactical planner's job
- Keep assignments at a high level: what needs to happen, not how
- For simple tasks, a single assignment is fine
- Each assignment id should be unique (e.g., assign-1, assign-2)`;
    verbose("GeneralPlanner: sending strategic plan request", userMessage);
    const plan = await callWithValidation(client, systemPrompt, userMessage, StrategicPlanSchema, {
        label: "GeneralPlanner",
    });
    verbose("GeneralPlanner: validated strategic plan", plan);
    const planMd = formatStrategicPlanMd(plan);
    await writeFile(join(plansDir, `STRATEGIC-${plan.id}.md`), planMd);
    return plan;
}
function formatStrategicPlanMd(plan) {
    const lines = [
        `# Strategic Plan: ${plan.id}`,
        "",
        `## Description`,
        plan.description,
        "",
        `## Assignments`,
    ];
    for (const a of plan.assignments) {
        lines.push(`### ${a.id}: ${a.description}`);
        if (a.context)
            lines.push(`- Context: ${a.context}`);
        if (a.constraints?.length) {
            lines.push(`- Constraints:`);
            for (const c of a.constraints)
                lines.push(`  - ${c}`);
        }
        lines.push("");
    }
    return lines.join("\n") + "\n";
}
function formatPlanMd(plan) {
    const lines = [
        `# Plan: ${plan.id}`,
        "",
        `## Description`,
        plan.description,
        "",
        `## Steps`,
    ];
    for (const step of plan.steps) {
        lines.push(`${step.order + 1}. **${step.description}**`);
        if (step.scriptId) {
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
