import type { LLMClient } from "./claude-client.js";
import type { IOAdapter } from "../io/IOAdapter.js";
import type { BBInput, BBOutput, IdentityContext, ViolationSummary } from "../types.js";
import { BBInputSchema, BBOutputSchema } from "../schemas.js";
import { getAgentConfig } from "../identity/loader.js";
import { writeAgentConfig, writeReviewerConfig } from "../identity/writer.js";
import { applyReview } from "./reviewed.js";
import { callWithValidation } from "./llm-utils.js";
import { verbose } from "../logger.js";

const MAX_SELF_MOD_ROUNDS = 3;

/**
 * Build the BB system prompt from agent config + context.
 */
function buildBBPrompt(identity: IdentityContext): string {
  const bbConfig = getAgentConfig(identity, "big-brother");
  return [
    bbConfig.agentMd,
    "",
    "## System Soul",
    identity.soul,
    "",
    "## System Constitution",
    identity.constitution,
  ].join("\n");
}

/**
 * Build the user message for BB from a violation and configs.
 */
function buildBBMessage(input: BBInput): string {
  const parts = [
    "## Violation Summary",
    `Violated Principle: ${input.violation.violatedPrinciple}`,
    `Error Class: ${input.violation.errorClass}`,
    `Affected Agent: ${input.violation.affectedAgentId}`,
  ];
  if (input.violation.affectedReviewerId) {
    parts.push(`Affected Reviewer: ${input.violation.affectedReviewerId}`);
  }
  parts.push("", "## Current Agent Config", "```", input.agentConfig, "```");
  if (input.reviewerConfig) {
    parts.push("", "## Current Reviewer Config", "```", input.reviewerConfig, "```");
  }
  parts.push("", "Propose updated config text to address this violation. Return your JSON response.");
  return parts.join("\n");
}

/**
 * Propose config updates to address a constitutional violation.
 */
export async function proposeConfigUpdate(
  client: LLMClient,
  input: BBInput,
  identity: IdentityContext
): Promise<BBOutput> {
  BBInputSchema.parse(input);

  const systemPrompt = buildBBPrompt(identity);
  const userMessage = buildBBMessage(input);

  verbose("BB: proposing config update", {
    affectedAgentId: input.violation.affectedAgentId,
    errorClass: input.violation.errorClass,
  });

  const result = await callWithValidation(client, systemPrompt, userMessage, BBOutputSchema, {
    label: "BIG_BROTHER",
    agentId: "big-brother",
  });

  verbose("BB: proposal ready", { changeRationale: result.changeRationale });
  return result;
}

export interface ApplyConfigOptions {
  /** Called after a config is written — use to trigger resetOnContextChange() */
  onConfigWrite?: (agentId: string) => void;
}

/**
 * Review BB's proposed changes and apply them if approved.
 * Returns true if changes were applied, false if rejected.
 */
export async function applyConfigUpdate(
  client: LLMClient,
  bbOutput: BBOutput,
  violation: ViolationSummary,
  identity: IdentityContext,
  adapter: IOAdapter | undefined,
  identityDir: string,
  runtimeDir: string,
  options: ApplyConfigOptions = {}
): Promise<boolean> {
  // Build a review-friendly summary of BB's proposed changes
  const reviewContent = [
    `BIG_BROTHER proposes config changes for agent "${violation.affectedAgentId}":`,
    `Rationale: ${bbOutput.changeRationale}`,
  ];
  if (bbOutput.updatedAgentConfig) {
    reviewContent.push("", "Updated agent config:", bbOutput.updatedAgentConfig);
  }
  if (bbOutput.updatedReviewerConfig) {
    reviewContent.push("", "Updated reviewer config:", bbOutput.updatedReviewerConfig);
  }

  try {
    await applyReview(reviewContent.join("\n"), identity, {
      client,
      adapter,
      subjectAgentId: "big-brother",
    });
  } catch {
    verbose("BB: config update rejected by review");
    return false;
  }

  // Review passed — write configs to disk using identity writer
  if (bbOutput.updatedAgentConfig) {
    const agentEntry = identity.agents.find((a) => a.id === violation.affectedAgentId);
    if (agentEntry) {
      await writeAgentConfig(identityDir, agentEntry.configFile, bbOutput.updatedAgentConfig, runtimeDir);
      verbose("BB: wrote updated agent config", { configFile: agentEntry.configFile });
      options.onConfigWrite?.(violation.affectedAgentId);
    }
  }

  if (bbOutput.updatedReviewerConfig && violation.affectedReviewerId) {
    await writeReviewerConfig(identityDir, violation.affectedReviewerId, bbOutput.updatedReviewerConfig, runtimeDir);
    verbose("BB: wrote updated reviewer config", { agentId: violation.affectedReviewerId });
    options.onConfigWrite?.(violation.affectedReviewerId);
  }

  return true;
}

/**
 * Self-modification loop: if BB's own output gets flagged, it can re-propose.
 * Hard cap of MAX_SELF_MOD_ROUNDS rounds.
 */
async function selfModLoop(
  client: LLMClient,
  input: BBInput,
  identity: IdentityContext,
  adapter: IOAdapter | undefined,
  identityDir: string,
  runtimeDir: string
): Promise<boolean> {
  for (let round = 1; round <= MAX_SELF_MOD_ROUNDS; round++) {
    verbose("BB: self-modification attempt", { round, max: MAX_SELF_MOD_ROUNDS });

    const output = await proposeConfigUpdate(client, input, identity);
    const applied = await applyConfigUpdate(
      client, output, input.violation, identity, adapter, identityDir, runtimeDir
    );

    if (applied) {
      verbose("BB: self-modification succeeded", { round });
      return true;
    }

    verbose("BB: self-modification rejected, retrying", { round });
  }

  // All rounds exhausted
  if (adapter) {
    adapter.sendError(
      `BIG_BROTHER failed to produce an approved config update after ${MAX_SELF_MOD_ROUNDS} attempts ` +
      `for agent "${input.violation.affectedAgentId}" (violation: ${input.violation.errorClass}). ` +
      `Manual review recommended.`
    );
  }
  return false;
}

/**
 * Entry point called by Reviewer-Reviewer when a constitutional inconsistency is flagged.
 * Loads relevant configs, proposes updates, reviews them, and applies if approved.
 */
export async function triggerBigBrother(
  violation: ViolationSummary,
  client: LLMClient,
  identity: IdentityContext,
  adapter: IOAdapter | undefined,
  identityDir: string,
  runtimeDir: string
): Promise<void> {
  verbose("BB: triggered", {
    affectedAgentId: violation.affectedAgentId,
    errorClass: violation.errorClass,
  });

  // Load current agent config
  const agentEntry = identity.agents.find((a) => a.id === violation.affectedAgentId);
  if (!agentEntry) {
    verbose("BB: affected agent not found in registry", { agentId: violation.affectedAgentId });
    return;
  }

  const agentConfig = agentEntry.agentMd;
  const reviewerConfig = violation.affectedReviewerId
    ? identity.reviewerConfigs?.[violation.affectedReviewerId]
    : undefined;

  const input: BBInput = {
    violation,
    agentConfig,
    reviewerConfig,
    soul: identity.soul,
    constitution: identity.constitution,
  };

  await selfModLoop(client, input, identity, adapter, identityDir, runtimeDir);
}
