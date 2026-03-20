import type { ReviewResult, IdentityContext } from "../types.js";
import type { IOAdapter } from "../io/IOAdapter.js";
import type { LLMClient } from "./claude-client.js";
/**
 * Handle a FAFC (flag-and-force-confirmation) review decision.
 *
 * When an LLMClient is provided, generates a user-facing summary via LLM.
 * Otherwise falls back to review.summary or review.reasoning.
 * Routes the confirmation prompt through the IOAdapter.
 *
 * Returns the user's boolean decision (true = approved, false = denied).
 */
export declare function handleFAFC(review: ReviewResult, _identity: IdentityContext, adapter: IOAdapter, client?: LLMClient): Promise<boolean>;
