import { spawn } from "node:child_process";
import type { ScriptResult } from "../types.js";

export interface RunScriptOptions {
  timeoutMs?: number;
}

export function runScript(
  scriptPath: string,
  params: Record<string, string>,
  options: RunScriptOptions = {}
): Promise<ScriptResult> {
  const { timeoutMs = 30_000 } = options;
  const scriptId = scriptPath.split("/").pop()?.replace(".sh", "") ?? scriptPath;

  return new Promise((resolve, reject) => {
    const proc = spawn("bash", [scriptPath], {
      env: { ...process.env, ...params },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
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
