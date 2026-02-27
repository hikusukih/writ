export function buildSystemPrompt(agentConfig, identity) {
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
