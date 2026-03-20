/**
 * IOAdapter — Messaging Interface
 *
 * Defines the contract between the system and all input/output channels.
 * The CLI is the first implementation; future adapters (HTTP endpoint,
 * webhooks, dashboard) implement this interface without touching orchestrator
 * logic.
 *
 * Outbound: results, errors, review blocks, status messages.
 * Inbound: user requests, external triggers, FAFC responses.
 */
export interface IOAdapter {
  /** Display the response to a user request, including the provenance chain. */
  sendResult(response: string, provenanceChain: string): void | Promise<void>;

  /** Display an error message. */
  sendError(message: string): void | Promise<void>;

  /** Display a review-blocked notification. */
  sendReviewBlock(reasoning: string, matchedRules?: string[]): void | Promise<void>;

  /** Display a status or informational message (startup info, confirmations, etc.). */
  sendStatus(message: string): void | Promise<void>;

  /** Acknowledge receipt of a request (e.g. "request received, processing…"). */
  sendAcknowledgment(message: string): void | Promise<void>;

  /** Report progress on an in-flight job. */
  sendProgress(jobId: string, message: string): void | Promise<void>;

  /** Register a handler for inbound requests. Called once before start(). */
  onRequest(handler: (input: string) => Promise<void>): void;

  /**
   * Start accepting input. Returns a Promise that resolves when the adapter
   * stops (e.g. on EOF or explicit stop()).
   */
  start(): Promise<void>;

  /**
   * Present a confirmation prompt to the user and wait for yes/no.
   * Used by HJA when a reviewer returns FAFC.
   */
  requestConfirmation(summary: string, details?: string): Promise<boolean>;

  /** Gracefully stop the adapter. */
  stop(): void;
}
