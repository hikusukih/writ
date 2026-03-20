import type { ScriptInfo } from "../types.js";
export declare function listScripts(scriptsDir: string): Promise<ScriptInfo[]>;
export declare function parseScriptFrontmatter(content: string, filename: string, path: string): ScriptInfo | null;
