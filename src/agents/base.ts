import type { AgentConfig, AgentOutput, IdentityContext } from "../types.js";
import type { LLMClient } from "./claude-client.js";
import { buildSystemPrompt } from "./prompt-builder.js";

export async function invokeAgent(
  client: LLMClient,
  agentConfig: AgentConfig,
  input: string,
  identity: IdentityContext
): Promise<AgentOutput> {
  const systemPrompt = buildSystemPrompt(agentConfig, identity);
  const response = await client.sendMessage(systemPrompt, input, agentConfig.id);

  return {
    content: response.content,
    usage: {
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    },
  };
}
