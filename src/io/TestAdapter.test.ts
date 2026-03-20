import { describe, it, expect } from "vitest";
import { createTestAdapter } from "./TestAdapter.js";

describe("TestAdapter", () => {
  it("collects sendAcknowledgment calls", () => {
    const adapter = createTestAdapter();
    adapter.sendAcknowledgment("Request received.");
    adapter.sendAcknowledgment("Processing now.");
    expect(adapter.collected.acknowledgments).toEqual(["Request received.", "Processing now."]);
  });

  it("collects sendProgress calls with jobId and message", () => {
    const adapter = createTestAdapter();
    adapter.sendProgress("job-1", "step 1 of 3");
    adapter.sendProgress("job-2", "step 2 of 2");
    expect(adapter.collected.progressMessages).toEqual([
      { jobId: "job-1", message: "step 1 of 3" },
      { jobId: "job-2", message: "step 2 of 2" },
    ]);
  });

  it("acknowledgments and progressMessages start empty", () => {
    const adapter = createTestAdapter();
    expect(adapter.collected.acknowledgments).toHaveLength(0);
    expect(adapter.collected.progressMessages).toHaveLength(0);
  });
});
