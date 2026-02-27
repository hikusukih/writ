import type { InstructionFile, ScriptResult } from "../types.js";
export declare function executeInstructions(instructions: InstructionFile, scriptsDir: string): Promise<ScriptResult[]>;
