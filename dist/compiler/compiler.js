import { listScripts } from "../scripts/index.js";
import { runScript } from "../scripts/runner.js";
import { verbose } from "../logger.js";
export class CompilerError extends Error {
    stepOrder;
    scriptId;
    issue;
    constructor(message, stepOrder, scriptId, issue) {
        super(message);
        this.stepOrder = stepOrder;
        this.scriptId = scriptId;
        this.issue = issue;
        this.name = "CompilerError";
    }
}
function paramName(decl) {
    return decl.split(/\s+/)[0];
}
export async function compile(instructions, scriptsDir) {
    const scripts = await listScripts(scriptsDir);
    const scriptMap = new Map(scripts.map((s) => [s.id, s]));
    const results = [];
    const sortedSteps = [...instructions.steps].sort((a, b) => a.order - b.order);
    for (const step of sortedSteps) {
        const script = scriptMap.get(step.scriptId);
        if (!script) {
            throw new CompilerError(`Script "${step.scriptId}" not found in ${scriptsDir}`, step.order, step.scriptId, "script-not-found");
        }
        const declaredParams = new Set(script.params.map(paramName));
        for (const key of Object.keys(step.params)) {
            if (!declaredParams.has(key)) {
                throw new CompilerError(`Param "${key}" is not declared in script "${step.scriptId}" frontmatter`, step.order, step.scriptId, "undeclared-param");
            }
        }
        verbose("Compiler: executing", { scriptId: step.scriptId, path: script.path, params: step.params });
        const result = await runScript(script.path, step.params);
        verbose("Compiler: result", { scriptId: result.scriptId, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr });
        results.push(result);
    }
    return results;
}
