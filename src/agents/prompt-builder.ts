import type { AgentConfig, IdentityContext } from "../types.js";

export function buildSystemPrompt(
  agentConfig: AgentConfig,
  identity: IdentityContext
): string {
  const sections = [
    "# System Identity\n",
    identity.soul,
    "\n# Constitutional Values\n",
    identity.constitution,
    `\n# Agent: ${agentConfig.name} (${agentConfig.id})\n`,
    agentConfig.agentMd,
  ];

  return sections.join("\n");
}
