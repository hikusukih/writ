import type { AgentClass, AgentOutput, IdentityContext, SamplingRateState } from "../types.js";
import type { LLMClient } from "./claude-client.js";
import type { IOAdapter } from "../io/IOAdapter.js";
import { reviewOutput } from "./reviewer.js";
import { reviewWithLLM } from "./llm-reviewer.js";
import { handleFAFC } from "./human-judgment-agent.js";
import { appendReviewLog, buildLogEntry } from "./review-log.js";
import { getRate, recordClean, recordFlag } from "./sampling-rate.js";
import { verbose } from "../logger.js";

export interface SamplingContext {
  state: SamplingRateState;
  agentClass: AgentClass;
  onUpdate: (newState: SamplingRateState) => void;
}

export interface ReviewOptions {
  client?: LLMClient;
  skipReview?: boolean;
  adapter?: IOAdapter;
  subjectAgentId?: string;
  logsDir?: string;
  sampling?: SamplingContext;
}

/**
 * Apply review to a string output, throwing ReviewHaltError if flagged.
 * When a LLMClient is provided, uses LLM-based review; otherwise falls back to rule-based.
 *
 * FAFC decisions route through HJA when an adapter is provided.
 * Without an adapter, FAFC falls back to halt behavior (backward compat).
 */
export async function applyReview(
  content: string,
  identity: IdentityContext,
  options: ReviewOptions = {}
): Promise<void> {
  const { client, skipReview, adapter, subjectAgentId, logsDir, sampling } = options;
  if (skipReview) return;

  const reviewerConfig = subjectAgentId ? identity.reviewerConfigs?.[subjectAgentId] : undefined;
  const antiPatterns = subjectAgentId ? identity.antiPatterns?.[subjectAgentId] : undefined;

  // Sampling rate check: when provided, may skip LLM review (fall back to rule-based only)
  let useLLM = !!client;
  if (useLLM && sampling && subjectAgentId) {
    const rate = getRate(sampling.state, subjectAgentId, sampling.agentClass);
    if (Math.random() > rate) {
      verbose("review: sampled out, using rule-based only", { subjectAgentId, rate });
      useLLM = false;
    }
  }

  const review = useLLM && client
    ? await reviewWithLLM(content, subjectAgentId ?? "agent", identity, client, reviewerConfig, antiPatterns, logsDir)
    : reviewOutput(content, identity);

  // Log rule-based decisions when no LLM was used (LLM path logs internally)
  if (!useLLM && logsDir) {
    const entry = buildLogEntry(subjectAgentId ?? "agent", review.decision, review.reasoning, "rule", content);
    appendReviewLog(entry, logsDir).catch(() => {});
  }

  // Update sampling rate based on decision
  if (sampling && subjectAgentId) {
    const isFlagged = review.decision === "flag-and-halt" || review.decision === "fafc";
    const newState = isFlagged
      ? recordFlag(sampling.state, subjectAgentId)
      : recordClean(sampling.state, subjectAgentId, sampling.agentClass);
    sampling.onUpdate(newState);
  }

  if (review.decision === "fafc") {
    if (adapter) {
      const approved = await handleFAFC(review, identity, adapter, client);
      if (approved) return;
    }
    // No adapter or user denied — treat as halt
    throw new ReviewHaltError(review.reasoning, content, review.matchedRules);
  }

  if (review.decision === "flag-and-halt") {
    throw new ReviewHaltError(review.reasoning, content, review.matchedRules);
  }
  // flag-and-continue and request-modifications: pass through (logged by verbose)
}

export type AgentFn = (input: string) => Promise<AgentOutput>;
export type HaltCallback = (reasoning: string, output: string) => Promise<boolean>;

export function withReview(
  agentFn: AgentFn,
  identity: IdentityContext,
  onHalt?: HaltCallback
): AgentFn {
  return async (input: string): Promise<AgentOutput> => {
    const output = await agentFn(input);
    const review = reviewOutput(output.content, identity);

    if (review.decision === "allow") {
      return output;
    }

    if (review.decision === "flag-and-halt") {
      if (onHalt) {
        const userApproved = await onHalt(review.reasoning, output.content);
        if (userApproved) {
          return output;
        }
      }
      throw new ReviewHaltError(review.reasoning, output.content, review.matchedRules);
    }

    // flag-and-continue: return output but log the flag
    return output;
  };
}

export class ReviewHaltError extends Error {
  constructor(
    public readonly reasoning: string,
    public readonly flaggedOutput: string,
    public readonly matchedRules?: string[]
  ) {
    super(`Review halted: ${reasoning}`);
    this.name = "ReviewHaltError";
  }
}
