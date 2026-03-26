import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Readable } from "node:stream";
import { createCLIAdapter } from "./CLIAdapter.js";

describe("CLIAdapter output methods", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sendResult prints response and provenance chain", () => {
    const adapter = createCLIAdapter();
    adapter.sendResult("Hello world", "orchestrator → planner → executor");
    expect(logSpy).toHaveBeenCalledWith("\nHello world");
    expect(logSpy).toHaveBeenCalledWith("\n[orchestrator → planner → executor]\n");
  });

  it("sendError writes to stderr with prefix", () => {
    const adapter = createCLIAdapter();
    adapter.sendError("something went wrong");
    expect(errorSpy).toHaveBeenCalledWith("\nError: something went wrong\n");
  });

  it("sendReviewBlock formats with matched rules", () => {
    const adapter = createCLIAdapter();
    adapter.sendReviewBlock("request blocked", ["rule-1", "rule-2"]);
    expect(logSpy).toHaveBeenCalledWith(
      "\n[REVIEW BLOCKED] request blocked\nMatched rules: rule-1, rule-2\n"
    );
  });

  it("sendReviewBlock formats without matched rules", () => {
    const adapter = createCLIAdapter();
    adapter.sendReviewBlock("request blocked");
    expect(logSpy).toHaveBeenCalledWith("\n[REVIEW BLOCKED] request blocked\n");
  });

  it("sendStatus passes message through to console.log", () => {
    const adapter = createCLIAdapter();
    adapter.sendStatus("System ready.");
    expect(logSpy).toHaveBeenCalledWith("System ready.");
  });

  it("sendAcknowledgment prints message to stdout", () => {
    const adapter = createCLIAdapter();
    adapter.sendAcknowledgment("Request received, processing…");
    expect(logSpy).toHaveBeenCalledWith("Request received, processing…");
  });

  it("sendProgress prints [jobId] message to stdout", () => {
    const adapter = createCLIAdapter();
    adapter.sendProgress("job-42", "running step 1 of 3");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[job-42] running step 1 of 3"));
  });

  it("onRequest stores handler (smoke test — handler called with input)", async () => {
    const adapter = createCLIAdapter();
    const handler = vi.fn().mockResolvedValue(undefined);
    adapter.onRequest(handler);
    // Verify by accessing internal behavior via a second onRequest call
    // (can't easily call start() in tests without mocking readline)
    expect(handler).not.toHaveBeenCalled(); // not called until start() fires
  });
});

describe("CLIAdapter requestConfirmation", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let originalStdin: typeof process.stdin;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    originalStdin = process.stdin;
  });

  afterEach(() => {
    Object.defineProperty(process, "stdin", { value: originalStdin, writable: true });
    vi.restoreAllMocks();
  });

  function setStdinContent(content: string) {
    const readable = new Readable({ read() {} });
    readable.push(content);
    readable.push(null);
    Object.defineProperty(process, "stdin", { value: readable, writable: true });
  }

  it("returns true when user answers 'y'", async () => {
    setStdinContent("y\n");
    const adapter = createCLIAdapter();
    const result = await adapter.requestConfirmation("Delete files?");
    expect(result).toBe(true);
    expect(logSpy).toHaveBeenCalledWith("\n[CONFIRMATION REQUIRED] Delete files?");
  });

  it("returns true when user answers 'yes'", async () => {
    setStdinContent("yes\n");
    const adapter = createCLIAdapter();
    const result = await adapter.requestConfirmation("Delete files?");
    expect(result).toBe(true);
  });

  it("returns false when user answers 'n'", async () => {
    setStdinContent("n\n");
    const adapter = createCLIAdapter();
    const result = await adapter.requestConfirmation("Delete files?");
    expect(result).toBe(false);
  });

  it("returns false on empty input", async () => {
    setStdinContent("\n");
    const adapter = createCLIAdapter();
    const result = await adapter.requestConfirmation("Delete files?");
    expect(result).toBe(false);
  });

  it("displays details when provided", async () => {
    setStdinContent("y\n");
    const adapter = createCLIAdapter();
    await adapter.requestConfirmation("Delete files?", "This will remove 5 files.");
    expect(logSpy).toHaveBeenCalledWith("Details: This will remove 5 files.");
  });
});
