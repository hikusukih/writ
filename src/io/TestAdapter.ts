/**
 * TestAdapter — IOAdapter implementation for integration tests.
 *
 * Collects all output calls into inspectable arrays. requestConfirmation()
 * returns a pre-configured boolean. onRequest()/start()/stop() are no-ops —
 * tests call handleRequest() directly.
 */
import type { IOAdapter } from "./IOAdapter.js";

export interface TestAdapterCollections {
  results: Array<{ response: string; provenanceChain: string }>;
  errors: string[];
  reviewBlocks: Array<{ reasoning: string; matchedRules?: string[] }>;
  statusMessages: string[];
  confirmationRequests: Array<{ summary: string; details?: string }>;
  acknowledgments: string[];
  progressMessages: Array<{ jobId: string; message: string }>;
}

export interface TestAdapterOptions {
  /** Return value for requestConfirmation(). Defaults to true. */
  confirmationAnswer?: boolean;
}

export interface TestAdapter extends IOAdapter {
  collected: TestAdapterCollections;
}

export function createTestAdapter(options: TestAdapterOptions = {}): TestAdapter {
  const { confirmationAnswer = true } = options;

  const collected: TestAdapterCollections = {
    results: [],
    errors: [],
    reviewBlocks: [],
    statusMessages: [],
    confirmationRequests: [],
    acknowledgments: [],
    progressMessages: [],
  };

  return {
    collected,

    sendResult(response: string, provenanceChain: string): void {
      collected.results.push({ response, provenanceChain });
    },

    sendError(message: string): void {
      collected.errors.push(message);
    },

    sendReviewBlock(reasoning: string, matchedRules?: string[]): void {
      collected.reviewBlocks.push({ reasoning, matchedRules });
    },

    sendStatus(message: string): void {
      collected.statusMessages.push(message);
    },

    sendAcknowledgment(message: string): void {
      collected.acknowledgments.push(message);
    },

    sendProgress(jobId: string, message: string): void {
      collected.progressMessages.push({ jobId, message });
    },

    onRequest(_handler: (input: string) => Promise<void>): void {
      // No-op: tests call handleRequest() directly
    },

    async start(): Promise<void> {
      // No-op
    },

    async requestConfirmation(summary: string, details?: string): Promise<boolean> {
      collected.confirmationRequests.push({ summary, details });
      return confirmationAnswer;
    },

    stop(): void {
      // No-op
    },
  };
}
