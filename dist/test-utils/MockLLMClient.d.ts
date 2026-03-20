/**
 * MockLLMClient — LLMClient implementation for integration tests.
 *
 * Pattern-matches on system prompt and user message content to return
 * pipeline-appropriate responses for each agent role:
 *   - Orchestrator interpret → plain-English task description
 *   - GP createStrategicPlan() → StrategicPlan JSON with one WorkAssignment
 *   - LP createDetailedPlan() → Plan JSON referencing a bootstrap script
 *   - LLM reviewer → { decision: "allow" } (configurable per-test)
 *   - DW generateScript() → shell script JSON with frontmatter
 *   - HJA summary → plain-English summary
 *   - Response synthesis → natural language string
 *
 * All calls are logged to callLog[] for test assertions.
 *
 * When USE_REAL_LLM=1 is set, tests should use createClaudeClient() instead.
 */
import type { LLMClient } from "../agents/claude-client.js";
export interface MockLLMOptions {
    /**
     * JSON string returned for all reviewer calls.
     * Defaults to `{"decision":"allow","reasoning":"Content is safe."}`.
     * Set to a FAFC JSON string for FAFC test scenarios.
     */
    reviewerDecision?: string;
    /**
     * When true, the first LP call returns a plan with a __missing__ scriptId,
     * triggering the DW path. Subsequent LP calls return a normal plan.
     */
    firstLPMissing?: boolean;
}
export interface MockLLMClient extends LLMClient {
    /** Ordered log of detected call types, for test assertions. */
    callLog: string[];
}
export declare function createMockLLMClient(options?: MockLLMOptions): MockLLMClient;
