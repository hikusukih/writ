import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { listScripts } from "../scripts/index.js";
import { compile } from "../compiler/compiler.js";
import { verbose } from "../logger.js";
export async function executeFromPlan(plan, scriptsDir, plansDir) {
    const availableScripts = await listScripts(scriptsDir);
    const availableIds = new Set(availableScripts.map((s) => s.id));
    verbose("Executor: available script IDs", [...availableIds]);
    const skipped = plan.steps.filter((step) => !step.scriptId || !availableIds.has(step.scriptId));
    if (skipped.length > 0) {
        verbose("Executor: steps skipped (script not found)", skipped.map((s) => ({ order: s.order, scriptId: s.scriptId, description: s.description })));
    }
    const instructionFile = {
        planId: plan.id,
        steps: plan.steps
            .filter((step) => step.scriptId && availableIds.has(step.scriptId))
            .map((step) => ({
            scriptId: step.scriptId,
            params: step.params ?? {},
            order: step.order,
        })),
    };
    verbose("Executor: instruction file", instructionFile);
    // Write instruction file to disk for auditability
    const instructionPath = join(plansDir, `${plan.id}-instructions.json`);
    await writeFile(instructionPath, JSON.stringify(instructionFile, null, 2));
    const results = await compile(instructionFile, scriptsDir);
    return {
        planId: plan.id,
        results,
        instructionFile,
    };
}
