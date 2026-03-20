import { SemanticReviewError } from "../agents/semantic-review.js";
import type { LLMClient } from "../agents/claude-client.js";
import type { IdentityContext, InstructionFile, ScriptResult } from "../types.js";
export interface CompileOptions {
    semanticReview?: {
        client: LLMClient;
        identity: IdentityContext;
        enabled: boolean;
        mode: "always" | "sampling" | "fast-path-only";
    };
    /** Plan description for semantic review context */
    planDescription?: string;
}
export { SemanticReviewError };
export declare class CompilerError extends Error {
    readonly stepOrder: number;
    readonly scriptId: string;
    readonly issue: "script-not-found" | "undeclared-param";
    constructor(message: string, stepOrder: number, scriptId: string, issue: "script-not-found" | "undeclared-param");
}
export declare function compile(instructions: InstructionFile, scriptsDir: string, options?: CompileOptions): Promise<ScriptResult[]>;
