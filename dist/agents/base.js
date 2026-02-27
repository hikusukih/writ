import { buildSystemPrompt } from "./prompt-builder.js";
export async function invokeAgent(client, agentConfig, input, identity) {
    const systemPrompt = buildSystemPrompt(agentConfig, identity);
    const response = await client.sendMessage(systemPrompt, input);
    return {
        content: response.content,
        usage: {
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
        },
    };
}
