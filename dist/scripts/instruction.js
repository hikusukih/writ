import { runScript } from "./runner.js";
import { listScripts } from "./index.js";
import { verbose } from "../logger.js";
export async function executeInstructions(instructions, scriptsDir) {
    const scripts = await listScripts(scriptsDir);
    const results = [];
    const sortedSteps = [...instructions.steps].sort((a, b) => a.order - b.order);
    for (const step of sortedSteps) {
        const script = scripts.find((s) => s.id === step.scriptId);
        if (!script) {
            verbose("Script runner: script not found", { scriptId: step.scriptId, scriptsDir });
            results.push({
                scriptId: step.scriptId,
                exitCode: 127,
                stdout: "",
                stderr: `Script "${step.scriptId}" not found in ${scriptsDir}`,
            });
            continue;
        }
        verbose("Script runner: executing", { scriptId: step.scriptId, path: script.path, params: step.params });
        const result = await runScript(script.path, step.params);
        verbose("Script runner: result", { scriptId: result.scriptId, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr });
        results.push(result);
    }
    return results;
}
