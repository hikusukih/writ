import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { AgentRegistrySchema } from "../schemas.js";
export async function loadIdentity(basePath) {
    const [soul, constitution, registryRaw] = await Promise.all([
        readFile(join(basePath, "SOUL.md"), "utf-8"),
        readFile(join(basePath, "CONSTITUTION.md"), "utf-8"),
        readFile(join(basePath, "registry.json"), "utf-8"),
    ]);
    const registry = AgentRegistrySchema.parse(JSON.parse(registryRaw));
    const agents = await Promise.all(registry.agents.map(async (entry) => {
        const agentMdPath = join(basePath, "agents", entry.configFile);
        const agentMd = await readFile(agentMdPath, "utf-8");
        return {
            ...entry,
            agentMd,
        };
    }));
    return { soul, constitution, agents };
}
export function getAgentConfig(identity, agentId) {
    const config = identity.agents.find((a) => a.id === agentId);
    if (!config) {
        throw new Error(`Agent "${agentId}" not found in registry. Available: ${identity.agents.map((a) => a.id).join(", ")}`);
    }
    return config;
}
