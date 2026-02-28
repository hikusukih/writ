import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendAntiPattern } from "./anti-patterns.js";

describe("appendAntiPattern", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "writ-ap-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true });
  });

  it("creates new file with header when file does not exist", async () => {
    await appendAntiPattern(testDir, "test-agent", "Do not hardcode paths");
    const content = await readFile(join(testDir, "anti-patterns-test-agent.md"), "utf-8");
    expect(content).toContain("# Anti-Patterns: test-agent");
    expect(content).toContain("Do not hardcode paths");
  });

  it("appends to existing file", async () => {
    const filePath = join(testDir, "anti-patterns-orchestrator.md");
    await writeFile(filePath, "# Anti-Patterns: orchestrator\n");
    await appendAntiPattern(testDir, "orchestrator", "First entry");
    await appendAntiPattern(testDir, "orchestrator", "Second entry");
    const content = await readFile(filePath, "utf-8");
    expect(content).toContain("First entry");
    expect(content).toContain("Second entry");
  });

  it("includes ISO timestamp in entry", async () => {
    await appendAntiPattern(testDir, "planner", "Some pattern");
    const content = await readFile(join(testDir, "anti-patterns-planner.md"), "utf-8");
    // ISO timestamp pattern: YYYY-MM-DDTHH:MM:SS
    expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
