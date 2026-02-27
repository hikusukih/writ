import { appendFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { easternTimestamp } from "../logger.js";
import type { ReviewDecision, ReviewLogEntry } from "../types.js";

const LOG_FILE = "review-decisions.jsonl";

/** Compute a SHA-256 hash of content (privacy — we never log raw content). */
export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Build a ReviewLogEntry from review results. */
export function buildLogEntry(
  subjectAgentId: string,
  decision: ReviewDecision,
  reasoning: string,
  reviewerType: "rule" | "llm",
  content: string
): ReviewLogEntry {
  return {
    timestamp: easternTimestamp(),
    subjectAgentId,
    decision,
    reasoning,
    reviewerType,
    contentHash: hashContent(content),
  };
}

/** Append a review log entry to the JSONL log file. */
export async function appendReviewLog(
  entry: ReviewLogEntry,
  logsDir: string
): Promise<void> {
  await mkdir(logsDir, { recursive: true });
  const line = JSON.stringify(entry) + "\n";
  await appendFile(join(logsDir, LOG_FILE), line);
}

/** Read the last N entries from the review log. Returns all if limit is not specified. */
export async function readReviewLog(
  logsDir: string,
  limit?: number
): Promise<ReviewLogEntry[]> {
  const path = join(logsDir, LOG_FILE);
  let content: string;
  try {
    content = await readFile(path, "utf-8");
  } catch {
    return [];
  }

  const lines = content.trim().split("\n").filter((l) => l.length > 0);
  const entries: ReviewLogEntry[] = [];

  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as ReviewLogEntry);
    } catch {
      // Skip malformed lines
    }
  }

  if (limit !== undefined && limit > 0) {
    return entries.slice(-limit);
  }
  return entries;
}
