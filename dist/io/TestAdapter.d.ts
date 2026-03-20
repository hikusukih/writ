/**
 * TestAdapter — IOAdapter implementation for integration tests.
 *
 * Collects all output calls into inspectable arrays. requestConfirmation()
 * returns a pre-configured boolean. onRequest()/start()/stop() are no-ops —
 * tests call handleRequest() directly.
 */
import type { IOAdapter } from "./IOAdapter.js";
export interface TestAdapterCollections {
    results: Array<{
        response: string;
        provenanceChain: string;
    }>;
    errors: string[];
    reviewBlocks: Array<{
        reasoning: string;
        matchedRules?: string[];
    }>;
    statusMessages: string[];
    confirmationRequests: Array<{
        summary: string;
        details?: string;
    }>;
    acknowledgments: string[];
    progressMessages: Array<{
        jobId: string;
        message: string;
    }>;
}
export interface TestAdapterOptions {
    /** Return value for requestConfirmation(). Defaults to true. */
    confirmationAnswer?: boolean;
}
export interface TestAdapter extends IOAdapter {
    collected: TestAdapterCollections;
}
export declare function createTestAdapter(options?: TestAdapterOptions): TestAdapter;
