import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { AgentRegistrySchema } from "../schemas.js";
import type { AgentConfig, IdentityContext } from "../types.js";

export async function loadIdentity(basePath: string): Promise<IdentityContext> {
  const [soul, constitution, registryRaw] = await Promise.all([
    readFile(join(basePath, "SOUL.md"), "utf-8"),
    readFile(join(basePath, "CONSTITUTION.md"), "utf-8"),
    readFile(join(basePath, "registry.json"), "utf-8"),
  ]);

  const registry = AgentRegistrySchema.parse(JSON.parse(registryRaw));

  const agents: AgentConfig[] = await Promise.all(
    registry.agents.map(async (entry) => {
      const agentMdPath = join(basePath, "agents", entry.configFile);
      const agentMd = await readFile(agentMdPath, "utf-8");
      return {
        ...entry,
        agentMd,
      };
    })
  );

  // Load reviewer configs for each registered agent (graceful degradation — not required)
  const reviewerConfigs: Record<string, string> = {};
  await Promise.all(
    registry.agents.map(async (entry) => {
      const reviewerPath = join(basePath, "agents", `${entry.id}-reviewer-agent.md`);
      try {
        reviewerConfigs[entry.id] = await readFile(reviewerPath, "utf-8");
      } catch {
        // Reviewer config is optional — skip if not present
      }
    })
  );

  // Load anti-pattern files (graceful — directory may not exist)
  const antiPatterns: Record<string, string> = {};
  try {
    const antiPatternsDir = join(basePath, "anti-patterns");
    const files = await readdir(antiPatternsDir);
    await Promise.all(
      files
        .filter((f) => f.startsWith("anti-patterns-") && f.endsWith(".md"))
        .map(async (f) => {
          const agentId = f.replace("anti-patterns-", "").replace(".md", "");
          antiPatterns[agentId] = await readFile(join(antiPatternsDir, f), "utf-8");
        })
    );
  } catch {
    // Anti-patterns directory is optional — skip if not present
  }

  return { soul, constitution, agents, reviewerConfigs, antiPatterns };
}

export function getAgentConfig(
  identity: IdentityContext,
  agentId: string
): AgentConfig {
  const config = identity.agents.find((a) => a.id === agentId);
  if (!config) {
    throw new Error(
      `Agent "${agentId}" not found in registry. Available: ${identity.agents.map((a) => a.id).join(", ")}`
    );
  }
  return config;
}
