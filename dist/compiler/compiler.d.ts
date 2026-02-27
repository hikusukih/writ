import type { InstructionFile, ScriptResult } from "../types.js";
export declare class CompilerError extends Error {
    readonly stepOrder: number;
    readonly scriptId: string;
    readonly issue: "script-not-found" | "undeclared-param";
    constructor(message: string, stepOrder: number, scriptId: string, issue: "script-not-found" | "undeclared-param");
}
export declare function compile(instructions: InstructionFile, scriptsDir: string): Promise<ScriptResult[]>;
