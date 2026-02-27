import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadIdentity, getAgentConfig } from "./loader.js";

describe("loadIdentity", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), "domesticlaw-test-"));
    await mkdir(join(testDir, "agents"), { recursive: true });

    await writeFile(join(testDir, "SOUL.md"), "# Test Soul\nBe helpful.");
    await writeFile(
      join(testDir, "CONSTITUTION.md"),
      "# Test Constitution\nBe honest."
    );
    await writeFile(
      join(testDir, "registry.json"),
      JSON.stringify({
        agents: [
          {
            id: "test-agent",
            name: "Test Agent",
            class: "action",
            configFile: "test-agent.md",
            permissions: { canRead: ["SOUL.md"], canWrite: [] },
          },
        ],
      })
    );
    await writeFile(
      join(testDir, "agents", "test-agent.md"),
      "# Test Agent\nDoes testing."
    );
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true });
  });

  it("loads all identity files and returns typed context", async () => {
    const identity = await loadIdentity(testDir);

    expect(identity.soul).toContain("Test Soul");
    expect(identity.constitution).toContain("Test Constitution");
    expect(identity.agents).toHaveLength(1);
    expect(identity.agents[0].id).toBe("test-agent");
    expect(identity.agents[0].class).toBe("action");
    expect(identity.agents[0].agentMd).toContain("Does testing");
  });

  it("returns empty reviewerConfigs when no reviewer config files exist", async () => {
    const identity = await loadIdentity(testDir);
    expect(identity.reviewerConfigs).toEqual({});
  });

  it("loads reviewer config when file exists", async () => {
    await writeFile(
      join(testDir, "agents", "test-agent-reviewer-agent.md"),
      "# Test Reviewer\nFlag dangerous content."
    );
    const identity = await loadIdentity(testDir);
    expect(identity.reviewerConfigs?.["test-agent"]).toContain("Flag dangerous content");
    // Clean up so other tests aren't affected
    await rm(join(testDir, "agents", "test-agent-reviewer-agent.md"));
  });

  it("throws on missing SOUL.md", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "domesticlaw-empty-"));
    await expect(loadIdentity(emptyDir)).rejects.toThrow();
    await rm(emptyDir, { recursive: true });
  });

  it("returns empty antiPatterns when no anti-patterns directory exists", async () => {
    const identity = await loadIdentity(testDir);
    expect(identity.antiPatterns).toEqual({});
  });

  it("loads anti-pattern files when directory exists", async () => {
    const apDir = join(testDir, "anti-patterns");
    await mkdir(apDir, { recursive: true });
    await writeFile(join(apDir, "anti-patterns-test-agent.md"), "# Anti-Patterns\n- Don't do X");
    const identity = await loadIdentity(testDir);
    expect(identity.antiPatterns?.["test-agent"]).toContain("Don't do X");
    await rm(apDir, { recursive: true });
  });

  it("extracts agent IDs correctly from anti-pattern filenames", async () => {
    const apDir = join(testDir, "anti-patterns");
    await mkdir(apDir, { recursive: true });
    await writeFile(join(apDir, "anti-patterns-my-cool-agent.md"), "content");
    await writeFile(join(apDir, "anti-patterns-orchestrator.md"), "orch content");
    await writeFile(join(apDir, "not-an-antipattern.md"), "ignored"); // wrong prefix
    const identity = await loadIdentity(testDir);
    expect(identity.antiPatterns?.["my-cool-agent"]).toBe("content");
    expect(identity.antiPatterns?.["orchestrator"]).toBe("orch content");
    expect(Object.keys(identity.antiPatterns!)).toHaveLength(2);
    await rm(apDir, { recursive: true });
  });

  it("throws on invalid registry.json", async () => {
    const badDir = await mkdtemp(join(tmpdir(), "domesticlaw-bad-"));
    await mkdir(join(badDir, "agents"), { recursive: true });
    await writeFile(join(badDir, "SOUL.md"), "soul");
    await writeFile(join(badDir, "CONSTITUTION.md"), "constitution");
    await writeFile(join(badDir, "registry.json"), '{"agents": [{"bad": true}]}');

    await expect(loadIdentity(badDir)).rejects.toThrow();
    await rm(badDir, { recursive: true });
  });
});

describe("getAgentConfig", () => {
  it("returns the matching agent config", () => {
    const identity = {
      soul: "soul",
      constitution: "constitution",
      agents: [
        {
          id: "orchestrator",
          name: "Orchestrator",
          class: "os" as const,
          configFile: "orchestrator-agent.md",
          agentMd: "# Orchestrator",
          permissions: { canRead: [], canWrite: [] },
        },
      ],
    };

    const config = getAgentConfig(identity, "orchestrator");
    expect(config.id).toBe("orchestrator");
    expect(config.name).toBe("Orchestrator");
  });

  it("throws for unknown agent id", () => {
    const identity = { soul: "", constitution: "", agents: [] };
    expect(() => getAgentConfig(identity, "nonexistent")).toThrow(
      'Agent "nonexistent" not found'
    );
  });
});
