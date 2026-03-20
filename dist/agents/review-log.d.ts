import type { ReviewDecision, ReviewLogEntry } from "../types.js";
/** Compute a SHA-256 hash of content (privacy — we never log raw content). */
export declare function hashContent(content: string): string;
/** Build a ReviewLogEntry from review results. */
export declare function buildLogEntry(subjectAgentId: string, decision: ReviewDecision, reasoning: string, reviewerType: "rule" | "llm", content: string): ReviewLogEntry;
/** Append a review log entry to the JSONL log file. */
export declare function appendReviewLog(entry: ReviewLogEntry, logsDir: string): Promise<void>;
/** Read the last N entries from the review log. Returns all if limit is not specified. */
export declare function readReviewLog(logsDir: string, limit?: number): Promise<ReviewLogEntry[]>;
