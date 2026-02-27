import { spawn } from "node:child_process";
export function runScript(scriptPath, params, options = {}) {
    const { timeoutMs = 30_000 } = options;
    const scriptId = scriptPath.split("/").pop()?.replace(".sh", "") ?? scriptPath;
    return new Promise((resolve, reject) => {
        const proc = spawn("bash", [scriptPath], {
            env: { ...process.env, ...params },
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });
        proc.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });
        const timer = setTimeout(() => {
            proc.kill("SIGTERM");
            reject(new Error(`Script "${scriptId}" timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        proc.on("close", (code) => {
            clearTimeout(timer);
            resolve({
                scriptId,
                exitCode: code ?? 1,
                stdout: stdout.trimEnd(),
                stderr: stderr.trimEnd(),
            });
        });
        proc.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}
