import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendReviewLog, readReviewLog, hashContent, buildLogEntry } from "./review-log.js";
import type { ReviewLogEntry } from "../types.js";

describe("review-log", () => {
  let logsDir: string;

  beforeAll(async () => {
    logsDir = await mkdtemp(join(tmpdir(), "review-log-test-"));
  });

  afterAll(async () => {
    await rm(logsDir, { recursive: true, force: true });
  });

  it("hashContent produces a consistent SHA-256 hex string", () => {
    const hash = hashContent("hello world");
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashContent("hello world"));
    expect(hash).not.toBe(hashContent("different content"));
  });

  it("buildLogEntry produces a valid ReviewLogEntry", () => {
    const entry = buildLogEntry("orchestrator", "allow", "Safe output", "llm", "test content");
    expect(entry.subjectAgentId).toBe("orchestrator");
    expect(entry.decision).toBe("allow");
    expect(entry.reasoning).toBe("Safe output");
    expect(entry.reviewerType).toBe("llm");
    expect(entry.contentHash).toHaveLength(64);
    expect(entry.timestamp).toBeTruthy();
  });

  it("appendReviewLog writes entries to JSONL file", async () => {
    const entry = buildLogEntry("planner", "allow", "OK", "rule", "content 1");
    await appendReviewLog(entry, logsDir);

    const raw = await readFile(join(logsDir, "review-decisions.jsonl"), "utf-8");
    const parsed = JSON.parse(raw.trim());
    expect(parsed.subjectAgentId).toBe("planner");
    expect(parsed.decision).toBe("allow");
  });

  it("appendReviewLog appends multiple entries", async () => {
    const entry2 = buildLogEntry("executor", "flag-and-halt", "Dangerous", "llm", "content 2");
    await appendReviewLog(entry2, logsDir);

    const entries = await readReviewLog(logsDir);
    expect(entries.length).toBe(2);
    expect(entries[0].subjectAgentId).toBe("planner");
    expect(entries[1].subjectAgentId).toBe("executor");
  });

  it("readReviewLog returns last N entries with limit", async () => {
    const entries = await readReviewLog(logsDir, 1);
    expect(entries).toHaveLength(1);
    expect(entries[0].subjectAgentId).toBe("executor");
  });

  it("readReviewLog returns empty array for missing file", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "review-log-empty-"));
    const entries = await readReviewLog(emptyDir);
    expect(entries).toHaveLength(0);
    await rm(emptyDir, { recursive: true, force: true });
  });

  it("readReviewLog skips malformed lines", async () => {
    // Create a dir with a malformed log file
    const badDir = await mkdtemp(join(tmpdir(), "review-log-bad-"));
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      join(badDir, "review-decisions.jsonl"),
      'not-json\n{"subjectAgentId":"ok","decision":"allow","reasoning":"fine","reviewerType":"rule","contentHash":"abc","timestamp":"now"}\n'
    );

    const entries = await readReviewLog(badDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].subjectAgentId).toBe("ok");
    await rm(badDir, { recursive: true, force: true });
  });

  it("creates the logs directory if it does not exist", async () => {
    const nestedDir = join(logsDir, "nested", "deep");
    const entry = buildLogEntry("test", "allow", "OK", "rule", "content");
    await appendReviewLog(entry, nestedDir);

    const entries = await readReviewLog(nestedDir);
    expect(entries).toHaveLength(1);
  });
});
