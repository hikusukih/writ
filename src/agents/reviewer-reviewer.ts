import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { LLMClient } from "./claude-client.js";
import type { IOAdapter } from "../io/IOAdapter.js";
import type { IdentityContext, RRInput, RROutput, ReviewLogEntry, ViolationSummary } from "../types.js";
import { RRInputSchema, RROutputSchema } from "../schemas.js";
import { readReviewLog } from "./review-log.js";
import { getAgentConfig } from "../identity/loader.js";
import { callWithValidation } from "./llm-utils.js";
import { triggerBigBrother } from "./big-brother.js";
import { verbose, easternTimestamp } from "../logger.js";

const RR_AUDIT_LOG = "rr-audit.jsonl";

/**
 * Build the RR system prompt from the OS-class agent config + SOUL + CONSTITUTION.
 * The agent config path is hardcoded — RR is immutable at runtime.
 */
function buildRRPrompt(identity: IdentityContext): string {
  const rrConfig = getAgentConfig(identity, "reviewer-reviewer");
  return [
    rrConfig.agentMd,
    "",
    "## System Soul",
    identity.soul,
    "",
    "## System Constitution",
    identity.constitution,
  ].join("\n");
}

/**
 * Build the user message for an RR audit from a review log entry.
 */
function buildAuditMessage(entry: ReviewLogEntry): string {
  return `Audit this reviewer decision:

Agent reviewed: "${entry.subjectAgentId}"
Reviewer type: ${entry.reviewerType}
Decision: ${entry.decision}
Reasoning: ${entry.reasoning}

Does this decision align with the system's SOUL and CONSTITUTION? Return your JSON assessment.`;
}

/**
 * Audit a single reviewer decision for constitutional consistency.
 */
export async function auditReviewDecision(
  client: LLMClient,
  input: RRInput,
  identity: IdentityContext
): Promise<RROutput> {
  RRInputSchema.parse(input);

  const systemPrompt = buildRRPrompt(identity);
  const userMessage = buildAuditMessage(input.reviewLogEntry);

  verbose("RR: auditing review decision", {
    subjectAgentId: input.reviewLogEntry.subjectAgentId,
    decision: input.reviewLogEntry.decision,
  });

  const result = await callWithValidation(client, systemPrompt, userMessage, RROutputSchema, {
    label: "Reviewer-Reviewer",
  });

  verbose("RR: audit result", {
    consistent: result.consistent,
    override: result.override ?? null,
  });

  return result;
}

/**
 * Append an RR audit result to the RR audit log.
 */
async function appendRRAuditLog(
  entry: ReviewLogEntry,
  result: RROutput,
  logsDir: string
): Promise<void> {
  await mkdir(logsDir, { recursive: true });
  const logEntry = {
    timestamp: easternTimestamp(),
    auditedEntry: {
      subjectAgentId: entry.subjectAgentId,
      decision: entry.decision,
      contentHash: entry.contentHash,
    },
    result,
  };
  await appendFile(resolve(logsDir, RR_AUDIT_LOG), JSON.stringify(logEntry) + "\n");
}

export interface SampleAndAuditOptions {
  identityDir?: string;
  runtimeDir?: string;
}

/**
 * Sample one review log entry and audit it via the Reviewer-Reviewer.
 *
 * @param sampleRate - Probability (0–1) of sampling. 1 = always, 0 = never.
 * @returns The RR audit result, or null if no sample was taken.
 */
export async function sampleAndAudit(
  client: LLMClient,
  identity: IdentityContext,
  adapter: IOAdapter | undefined,
  logsDir: string,
  sampleRate: number,
  options: SampleAndAuditOptions = {}
): Promise<RROutput | null> {
  // Decide whether to sample
  if (sampleRate <= 0 || Math.random() > sampleRate) {
    verbose("RR: skipped sampling", { sampleRate });
    return null;
  }

  // Read recent review log entries
  const entries = await readReviewLog(logsDir, 50);
  if (entries.length === 0) {
    verbose("RR: no review log entries to audit");
    return null;
  }

  // Pick a random entry to audit
  const entry = entries[Math.floor(Math.random() * entries.length)];

  const input: RRInput = {
    reviewLogEntry: entry,
    soul: identity.soul,
    constitution: identity.constitution,
  };

  const result = await auditReviewDecision(client, input, identity);

  // Log the audit result
  await appendRRAuditLog(entry, result, logsDir);

  // Handle flags
  if (!result.consistent) {
    verbose("RR: inconsistency detected", {
      override: result.override ?? null,
      violationSummary: result.violationSummary ?? null,
    });

    if (result.override) {
      verbose("RR: override suggested", {
        original: entry.decision,
        suggested: result.override,
      });
    }

    // Trigger BIG_BROTHER to propose config updates for the affected agent
    if (options.identityDir && options.runtimeDir) {
      const violation: ViolationSummary = {
        violatedPrinciple: result.violationSummary ?? "unspecified",
        errorClass: result.violationSummary ?? "reviewer inconsistency",
        affectedAgentId: entry.subjectAgentId,
      };
      triggerBigBrother(violation, client, identity, adapter, options.identityDir, options.runtimeDir).catch(
        (err) => verbose("BB: trigger error (non-blocking)", err instanceof Error ? err.message : String(err))
      );
    }
  }

  return result;
}
