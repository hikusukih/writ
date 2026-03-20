import type { LLMClient } from "./claude-client.js";
import type { IOAdapter } from "../io/IOAdapter.js";
import type { DeveloperWriterRequest, DeveloperWriterResult, IdentityContext, ScriptInfo } from "../types.js";
/**
 * Generate a shell script from a capability description using an LLM.
 */
export declare function generateScript(client: LLMClient, request: DeveloperWriterRequest, identity: IdentityContext): Promise<DeveloperWriterResult>;
/**
 * Write a generated script to the staging directory.
 * Returns the staging path.
 */
export declare function stageScript(content: string, scriptName: string): Promise<string>;
/**
 * Promote a staged script to the live scripts directory.
 * Re-parses frontmatter to confirm validity.
 * Throws if a script with the same name already exists.
 */
export declare function promoteScript(stagingPath: string, scriptsDir: string, options?: {
    onPromote?: () => void;
}): Promise<ScriptInfo>;
/**
 * Full DW pipeline: generate → review → stage → promote.
 * Returns the promoted ScriptInfo on success.
 * Throws ReviewHaltError if review blocks the script.
 */
export declare function generateAndPromote(client: LLMClient, request: DeveloperWriterRequest, identity: IdentityContext, scriptsDir: string, options?: {
    adapter?: IOAdapter;
    onPromote?: () => void;
}): Promise<ScriptInfo>;
