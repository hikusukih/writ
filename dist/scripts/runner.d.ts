import type { ScriptResult } from "../types.js";
export interface RunScriptOptions {
    timeoutMs?: number;
}
export declare function runScript(scriptPath: string, params: Record<string, string>, options?: RunScriptOptions): Promise<ScriptResult>;
