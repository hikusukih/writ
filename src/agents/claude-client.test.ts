import { describe, it, expect, vi, afterEach } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { withRetry } from "./claude-client.js";

// Minimal headers mock that satisfies the Anthropic SDK error constructor
const fakeHeaders = { get: (_k: string) => null } as unknown as Headers;

function makeRateLimitError(): Anthropic.RateLimitError {
  return new Anthropic.RateLimitError(429, undefined, "rate limited", fakeHeaders);
}

function makeServerError(): Anthropic.InternalServerError {
  return new Anthropic.InternalServerError(503, undefined, "overloaded", fakeHeaders);
}

function makeConnectionError(): Anthropic.APIConnectionError {
  return new Anthropic.APIConnectionError({ message: "connection refused" });
}

function makeBadRequestError(): Anthropic.BadRequestError {
  return new Anthropic.BadRequestError(400, undefined, "bad input", fakeHeaders);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("withRetry", () => {
  it("returns immediately on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on RateLimitError (429) and succeeds on second attempt", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makeRateLimitError())
      .mockResolvedValue("ok");

    const promise = withRetry(fn, 3);
    await vi.runAllTimersAsync();
    expect(await promise).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on InternalServerError (503)", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makeServerError())
      .mockResolvedValue("ok");

    const promise = withRetry(fn, 3);
    await vi.runAllTimersAsync();
    expect(await promise).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on APIConnectionError", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makeConnectionError())
      .mockResolvedValue("ok");

    const promise = withRetry(fn, 3);
    await vi.runAllTimersAsync();
    expect(await promise).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on non-retryable errors (400)", async () => {
    const fn = vi.fn().mockRejectedValue(makeBadRequestError());
    await expect(withRetry(fn, 3)).rejects.toBeInstanceOf(Anthropic.BadRequestError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on plain errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("something else"));
    await expect(withRetry(fn, 3)).rejects.toThrow("something else");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("rethrows after exhausting all attempts", async () => {
    vi.useFakeTimers();
    const err = makeRateLimitError();
    const fn = vi.fn().mockRejectedValue(err);

    const promise = withRetry(fn, 3);
    // Attach rejection handler before advancing timers to avoid unhandled rejection
    const assertion = expect(promise).rejects.toBe(err);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("respects maxAttempts=1 (no retries)", async () => {
    const fn = vi.fn().mockRejectedValue(makeRateLimitError());
    await expect(withRetry(fn, 1)).rejects.toBeInstanceOf(Anthropic.RateLimitError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
