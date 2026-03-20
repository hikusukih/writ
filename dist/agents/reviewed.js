import { reviewOutput } from "./reviewer.js";
import { reviewWithLLM } from "./llm-reviewer.js";
import { handleFAFC } from "./human-judgment-agent.js";
import { appendReviewLog, buildLogEntry } from "./review-log.js";
import { getRate, recordClean, recordFlag } from "./sampling-rate.js";
import { verbose } from "../logger.js";
/**
 * Apply review to a string output, throwing ReviewHaltError if flagged.
 * When a LLMClient is provided, uses LLM-based review; otherwise falls back to rule-based.
 *
 * FAFC decisions route through HJA when an adapter is provided.
 * Without an adapter, FAFC falls back to halt behavior (backward compat).
 */
export async function applyReview(content, identity, options = {}) {
    const { client, skipReview, adapter, subjectAgentId, logsDir, sampling } = options;
    if (skipReview)
        return;
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
        appendReviewLog(entry, logsDir).catch(() => { });
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
            if (approved)
                return;
        }
        // No adapter or user denied — treat as halt
        throw new ReviewHaltError(review.reasoning, content, review.matchedRules);
    }
    if (review.decision === "flag-and-halt") {
        throw new ReviewHaltError(review.reasoning, content, review.matchedRules);
    }
    // flag-and-continue and request-modifications: pass through (logged by verbose)
}
export function withReview(agentFn, identity, onHalt) {
    return async (input) => {
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
    reasoning;
    flaggedOutput;
    matchedRules;
    constructor(reasoning, flaggedOutput, matchedRules) {
        super(`Review halted: ${reasoning}`);
        this.reasoning = reasoning;
        this.flaggedOutput = flaggedOutput;
        this.matchedRules = matchedRules;
        this.name = "ReviewHaltError";
    }
}
