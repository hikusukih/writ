import type { LLMClient, ClaudeResponse, MessageParam } from "./claude-client.js";
import { verbose } from "../logger.js";

type OllamaMessage = { role: string; content: string };

export function createOllamaClient(baseUrl?: string, model?: string): LLMClient {
  const url = baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
  const mdl = model ?? process.env.OLLAMA_MODEL ?? "llama3.2";

  async function call(messages: OllamaMessage[]): Promise<ClaudeResponse> {
    const endpoint = `${url}/api/chat`;
    const body = { model: mdl, messages, stream: false };
    verbose("Ollama: request", { endpoint, model: mdl, messageCount: messages.length, messages });

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    verbose("Ollama: HTTP response status", `${res.status} ${res.statusText}`);

    if (!res.ok) {
      const errBody = await res.text();
      verbose("Ollama: error body", errBody);
      throw new Error(`Ollama error: ${res.status} ${errBody}`);
    }

    const raw = await res.text();
    verbose("Ollama: raw response body", raw);

    const data = JSON.parse(raw) as {
      message: { content: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    verbose("Ollama: parsed response", {
      content: data.message?.content,
      inputTokens: data.prompt_eval_count,
      outputTokens: data.eval_count,
    });

    return {
      content: data.message.content,
      inputTokens: data.prompt_eval_count ?? 0,
      outputTokens: data.eval_count ?? 0,
    };
  }

  return {
    sendMessage(systemPrompt: string, userMessage: string): Promise<ClaudeResponse> {
      return call([
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ]);
    },

    sendMessages(systemPrompt: string, messages: MessageParam[]): Promise<ClaudeResponse> {
      const mapped: OllamaMessage[] = messages.map((m) => ({
        role: m.role as string,
        content:
          typeof m.content === "string"
            ? m.content
            : m.content
                .filter((b) => b.type === "text")
                .map((b) => (b as { type: "text"; text: string }).text)
                .join(""),
      }));
      return call([{ role: "system", content: systemPrompt }, ...mapped]);
    },
  };
}
