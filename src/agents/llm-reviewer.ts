import type { LLMClient } from "./claude-client.js";
import type { IdentityContext, ReviewResult } from "../types.js";
import { ReviewerResponseSchema } from "../schemas.js";
import { reviewOutput } from "./reviewer.js";
import { appendReviewLog, buildLogEntry } from "./review-log.js";
import { callWithValidation } from "./llm-utils.js";
import { verbose } from "../logger.js";

const REVIEWER_SYSTEM_PREAMBLE = `You are the security and ethics reviewer for an AI agent system. Your job is to review agent outputs and determine whether they are safe, ethical, and aligned with the system's values before they proceed.

You must respond with ONLY a JSON object — no prose, no fences:
{"decision":"allow","reasoning":"brief explanation"}

Decision types:
- "allow": Output is safe, appropriate, and aligned with the system's soul and constitution.
- "flag-and-halt": Output contains dangerous content: security violations, secret or credential exposure, sudo or dangerous permission escalation, private keys, harmful instructions, or serious ethical violations. This blocks the output from proceeding.
- "flag-and-continue": Output has minor concerns worth logging but does not require blocking. Log and proceed.
- "request-modifications": Output has fixable issues — return the specific changes needed in an additional "modifications" field.
- "fafc": Flag-and-force-confirmation — output requires explicit human approval before proceeding. Use for elevated permissions, irreversible actions, or situations requiring human judgment. Include a "summary" field with a brief user-facing explanation of why confirmation is needed.

Be conservative: when in doubt between flag-and-halt and flag-and-continue, prefer flag-and-halt.`;

function buildReviewerPrompt(identity: IdentityContext, reviewerConfig?: string, antiPatterns?: string): string {
  const parts = [
    REVIEWER_SYSTEM_PREAMBLE,
    "",
    "## System Soul",
    identity.soul,
    "",
    "## System Constitution",
    identity.constitution,
  ];
  if (reviewerConfig) {
    parts.push("", "## Role-Specific Review Guidance", reviewerConfig);
  }
  if (antiPatterns) {
    parts.push("", "## Known Anti-Patterns", antiPatterns);
  }
  return parts.join("\n");
}

/**
 * Review content using an LLM (Claude). Falls back to rule-based reviewer
 * if the LLM call or response parsing fails after retries.
 */
export async function reviewWithLLM(
  content: string,
  subjectAgentId: string,
  identity: IdentityContext,
  client: LLMClient,
  reviewerConfig?: string,
  antiPatterns?: string,
  logsDir?: string
): Promise<ReviewResult> {
  const systemPrompt = buildReviewerPrompt(identity, reviewerConfig, antiPatterns);

  const userMessage = `Review this output from the "${subjectAgentId}" agent:

---
${content}
---

Does this output violate any security constraints, ethical guidelines, or the system's soul/constitution above? Return your JSON decision.`;

  try {
    verbose("LLM reviewer: sending review request", { subjectAgentId, contentLength: content.length });
    const result = await callWithValidation(client, systemPrompt, userMessage, ReviewerResponseSchema, {
      label: "LLM reviewer",
    });

    verbose("LLM reviewer: decision", { decision: result.decision, reasoning: result.reasoning });

    // Log LLM review decision (fire-and-forget)
    if (logsDir) {
      const entry = buildLogEntry(subjectAgentId, result.decision, result.reasoning, "llm", content);
      appendReviewLog(entry, logsDir).catch(() => {});
    }

    return {
      decision: result.decision,
      reasoning: result.reasoning,
      modifications: result.modifications,
      summary: result.summary,
    };
  } catch (err) {
    // Fall back to rule-based review on LLM or parse failure
    verbose("LLM reviewer: failed, falling back to rule-based", {
      degraded: true,
      subjectAgentId,
      reason: err instanceof Error ? err.message : String(err),
    });
    const fallbackResult = reviewOutput(content, identity);

    // Log fallback review decision (fire-and-forget)
    if (logsDir) {
      const entry = buildLogEntry(subjectAgentId, fallbackResult.decision, fallbackResult.reasoning, "rule", content);
      appendReviewLog(entry, logsDir).catch(() => {});
    }

    return { ...fallbackResult, degraded: true };
  }
}
