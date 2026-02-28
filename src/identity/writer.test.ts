import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeAgentConfig, writeReviewerConfig, backupConfig } from "./writer.js";

describe("writeAgentConfig", () => {
  let testDir: string;
  let identityDir: string;
  let runtimeDir: string;

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), "writ-writer-"));
    identityDir = join(testDir, "identity");
    runtimeDir = join(testDir, "runtime");
    await mkdir(join(identityDir, "agents"), { recursive: true });
    await mkdir(runtimeDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true });
  });

  it("writes config and reads it back", async () => {
    const content = "# Test Agent\nYou are a test agent.";
    await writeAgentConfig(identityDir, "test-agent.md", content);
    const read = await readFile(join(identityDir, "agents", "test-agent.md"), "utf-8");
    expect(read).toBe(content);
  });

  it("does not leave .pending files after successful write", async () => {
    await writeAgentConfig(identityDir, "clean-agent.md", "# Clean Agent\nClean.");
    const files = await readdir(join(identityDir, "agents"));
    expect(files.filter((f) => f.endsWith(".pending"))).toHaveLength(0);
  });

  it("creates backup when runtimeDir is provided", async () => {
    // Write initial config
    await writeFile(join(identityDir, "agents", "backup-test.md"), "# Original\nOriginal content.");
    // Overwrite with backup
    await writeAgentConfig(identityDir, "backup-test.md", "# Updated\nNew content.", runtimeDir);

    const backups = await readdir(join(runtimeDir, "config-backups"));
    const relevant = backups.filter((f) => f.startsWith("backup-test"));
    expect(relevant.length).toBeGreaterThan(0);

    // Verify the new content
    const read = await readFile(join(identityDir, "agents", "backup-test.md"), "utf-8");
    expect(read).toBe("# Updated\nNew content.");
  });

  it("rejects empty content", async () => {
    await expect(writeAgentConfig(identityDir, "empty.md", "")).rejects.toThrow("empty");
  });

  it("rejects whitespace-only content", async () => {
    await expect(writeAgentConfig(identityDir, "ws.md", "   \n  ")).rejects.toThrow("empty");
  });

  it("rejects content without markdown heading", async () => {
    await expect(
      writeAgentConfig(identityDir, "nohead.md", "Just plain text without heading")
    ).rejects.toThrow("heading");
  });
});

describe("writeReviewerConfig", () => {
  let testDir: string;
  let identityDir: string;

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), "writ-writer-rev-"));
    identityDir = join(testDir, "identity");
    await mkdir(join(identityDir, "agents"), { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true });
  });

  it("writes reviewer config with correct filename", async () => {
    await writeReviewerConfig(identityDir, "planner", "# Planner Reviewer\nCheck plans.");
    const read = await readFile(
      join(identityDir, "agents", "planner-reviewer-agent.md"),
      "utf-8"
    );
    expect(read).toBe("# Planner Reviewer\nCheck plans.");
  });
});

describe("backupConfig", () => {
  let testDir: string;
  let identityDir: string;
  let runtimeDir: string;

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), "writ-writer-bk-"));
    identityDir = join(testDir, "identity");
    runtimeDir = join(testDir, "runtime");
    await mkdir(join(identityDir, "agents"), { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true });
  });

  it("creates a backup copy of existing config", async () => {
    await writeFile(join(identityDir, "agents", "bk-test.md"), "# Original");
    await backupConfig(identityDir, "bk-test.md", runtimeDir);

    const backups = await readdir(join(runtimeDir, "config-backups"));
    expect(backups.filter((f) => f.startsWith("bk-test"))).toHaveLength(1);
  });

  it("silently skips when original does not exist", async () => {
    // Should not throw
    await backupConfig(identityDir, "nonexistent.md", runtimeDir);
  });
});
