import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PlanSchema } from "../schemas.js";
import { buildSystemPrompt } from "./prompt-builder.js";
import { getAgentConfig } from "../identity/loader.js";
import { listScripts } from "../scripts/index.js";
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
    const response = await client.sendMessage(systemPrompt, userMessage);
    verbose("Planner: raw LLM response", response.content);
    // Extract JSON from response (handle potential markdown fences)
    const jsonStr = extractJson(response.content);
    verbose("Planner: extracted JSON", jsonStr);
    const parsed = JSON.parse(jsonStr);
    const plan = PlanSchema.parse(parsed);
    verbose("Planner: validated plan", plan);
    // Write natural language plan to disk for auditability
    const planMd = formatPlanMd(plan);
    await writeFile(join(plansDir, `PLAN-${plan.id}.md`), planMd);
    return plan;
}
function extractJson(text) {
    // Try to extract from markdown code fence first
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch)
        return fenceMatch[1].trim();
    // Try to find raw JSON object
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch)
        return braceMatch[0];
    return text.trim();
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
