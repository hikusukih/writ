import { readFile } from "node:fs/promises";
import { listScripts } from "../scripts/index.js";
import { runScript } from "../scripts/runner.js";
import { InstructionFileSchema } from "../schemas.js";
import { verbose } from "../logger.js";
import { shouldSemanticReview, semanticReview, SemanticReviewError } from "../agents/semantic-review.js";
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

export class CompilerError extends Error {
  constructor(
    message: string,
    public readonly stepOrder: number,
    public readonly scriptId: string,
    public readonly issue: "script-not-found" | "undeclared-param"
  ) {
    super(message);
    this.name = "CompilerError";
  }
}

function paramName(decl: string): string {
  return decl.split(/\s+/)[0];
}

export async function compile(
  instructions: InstructionFile,
  scriptsDir: string,
  options: CompileOptions = {}
): Promise<ScriptResult[]> {
  InstructionFileSchema.parse(instructions);
  const scripts = await listScripts(scriptsDir);
  const scriptMap = new Map(scripts.map((s) => [s.id, s]));
  const results: ScriptResult[] = [];

  const sortedSteps = [...instructions.steps].sort((a, b) => a.order - b.order);

  // Phase 1: Validate all steps before execution
  for (const step of sortedSteps) {
    const script = scriptMap.get(step.scriptId);
    if (!script) {
      throw new CompilerError(
        `Script "${step.scriptId}" not found in ${scriptsDir}`,
        step.order,
        step.scriptId,
        "script-not-found"
      );
    }

    const declaredParams = new Set(script.params.map(paramName));
    for (const key of Object.keys(step.params)) {
      if (!declaredParams.has(key)) {
        throw new CompilerError(
          `Param "${key}" is not declared in script "${step.scriptId}" frontmatter`,
          step.order,
          step.scriptId,
          "undeclared-param"
        );
      }
    }
  }

  // Phase 2: Semantic review gate (between validation and execution)
  if (options.semanticReview && shouldSemanticReview(options.semanticReview)) {
    const composedScript = await buildComposedScript(sortedSteps, scriptMap, scriptsDir);
    const planDesc = options.planDescription ?? instructions.planId;
    const result = await semanticReview(
      options.semanticReview.client,
      composedScript,
      planDesc,
      options.semanticReview.identity
    );
    if (!result.approved) {
      throw new SemanticReviewError(result);
    }
  }

  // Phase 3: Execute validated steps
  for (const step of sortedSteps) {
    const script = scriptMap.get(step.scriptId)!;
    verbose("Compiler: executing", { scriptId: step.scriptId, path: script.path, params: step.params });
    const result = await runScript(script.path, step.params);
    verbose("Compiler: result", { scriptId: result.scriptId, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr });
    results.push(result);
  }

  return results;
}

/**
 * Build a human-readable summary of what the composed script will do.
 */
async function buildComposedScript(
  steps: { scriptId: string; params: Record<string, string> }[],
  scriptMap: Map<string, { id: string; path: string }>,
  scriptsDir: string
): Promise<string> {
  const parts: string[] = [];
  for (const step of steps) {
    const script = scriptMap.get(step.scriptId);
    if (!script) continue;
    try {
      const content = await readFile(script.path, "utf-8");
      const paramsStr = Object.entries(step.params)
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      parts.push(`# Step: ${step.scriptId} (${paramsStr})\n${content}`);
    } catch {
      parts.push(`# Step: ${step.scriptId} (script content unavailable)`);
    }
  }
  return parts.join("\n\n");
}
