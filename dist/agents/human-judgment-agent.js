import { verbose } from "../logger.js";
/**
 * Handle a FAFC (flag-and-force-confirmation) review decision.
 *
 * When an LLMClient is provided, generates a user-facing summary via LLM.
 * Otherwise falls back to review.summary or review.reasoning.
 * Routes the confirmation prompt through the IOAdapter.
 *
 * Returns the user's boolean decision (true = approved, false = denied).
 */
export async function handleFAFC(review, _identity, adapter, client) {
    let summary;
    if (client) {
        try {
            verbose("HJA: generating user-facing summary via LLM");
            const response = await client.sendMessage("You summarize review findings for a non-technical user in plain language. Be concise — one or two sentences.", `Summarize this review finding for the user:\n\n${review.reasoning}`);
            summary = response.content.trim();
            verbose("HJA: LLM summary generated", summary);
        }
        catch (err) {
            verbose("HJA: LLM summary failed, falling back", err);
            summary = review.summary ?? review.reasoning;
        }
    }
    else {
        summary = review.summary ?? review.reasoning;
    }
    verbose("HJA: requesting confirmation", { summary, reasoning: review.reasoning });
    return adapter.requestConfirmation(summary, review.reasoning);
}
