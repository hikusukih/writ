import type { LLMClient } from "./claude-client.js";
import type { IdentityContext, SemanticReviewResult } from "../types.js";
import { SemanticReviewResultSchema } from "../schemas.js";
import { callWithValidation } from "./llm-utils.js";
import { verbose } from "../logger.js";

export interface SemanticReviewConfig {
  enabled: boolean;
  mode: "always" | "sampling" | "fast-path-only";
}

/**
 * Determine whether semantic review should run based on config.
 */
export function shouldSemanticReview(config: SemanticReviewConfig): boolean {
  if (!config.enabled) return false;
  // For now, "always" mode means always review when enabled.
  // "sampling" and "fast-path-only" can be refined later.
  return config.mode === "always";
}

const SEMANTIC_REVIEW_SYSTEM = `You are a pre-execution semantic reviewer. Your job is to verify that a composed shell script matches the stated plan before it runs.

You receive:
1. A plan description (what should happen)
2. A composed shell script (what will actually run)

Determine whether the script faithfully implements the plan. Look for:
- Does the script do what the plan says?
- Are there extra operations not in the plan?
- Are there missing operations from the plan?
- Could the script have unintended side effects?

Respond with ONLY a JSON object, no fences, no prose:
{"approved": true, "concerns": [], "planAlignment": "aligned"}

Fields:
- approved (boolean): true if the script faithfully implements the plan
- concerns (string[]): list of specific concerns (empty if none)
- planAlignment: "aligned" if script matches plan, "divergent" if script deviates, "unclear" if plan is too vague to assess`;

/**
 * Run semantic review on a composed script against its plan description.
 */
export async function semanticReview(
  client: LLMClient,
  composedScript: string,
  planDescription: string,
  identity: IdentityContext
): Promise<SemanticReviewResult> {
  const systemPrompt = [
    SEMANTIC_REVIEW_SYSTEM,
    "",
    "## System Soul",
    identity.soul,
    "",
    "## System Constitution",
    identity.constitution,
  ].join("\n");

  const userMessage = `## Plan Description
${planDescription}

## Composed Script
\`\`\`bash
${composedScript}
\`\`\`

Does this script faithfully implement the plan? Return your JSON assessment.`;

  verbose("Semantic review: checking script against plan", {
    planLength: planDescription.length,
    scriptLength: composedScript.length,
  });

  const result = await callWithValidation(
    client,
    systemPrompt,
    userMessage,
    SemanticReviewResultSchema,
    { label: "Semantic review" }
  );

  verbose("Semantic review: result", {
    approved: result.approved,
    planAlignment: result.planAlignment,
    concerns: result.concerns?.length ?? 0,
  });

  return result;
}

export class SemanticReviewError extends Error {
  constructor(
    public readonly result: SemanticReviewResult
  ) {
    const concerns = result.concerns?.join("; ") ?? "no details";
    super(`Semantic review rejected script: ${concerns} (alignment: ${result.planAlignment})`);
    this.name = "SemanticReviewError";
  }
}
