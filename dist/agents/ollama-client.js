import { verbose } from "../logger.js";
const DEFAULT_OLLAMA_MODEL = "llama3.1:8b";
/** Maps agent IDs to their per-agent env var names. */
const AGENT_MODEL_ENV_KEYS = {
    orchestrator: "OLLAMA_MODEL_ORCHESTRATOR",
    planner: "OLLAMA_MODEL_PLANNER",
    "lieutenant-planner": "OLLAMA_MODEL_LIEUTENANT_PLANNER",
    "developer-writer": "OLLAMA_MODEL_DEVELOPER_WRITER",
    executor: "OLLAMA_MODEL_EXECUTOR",
    reviewer: "OLLAMA_MODEL_REVIEWER",
    "reviewer-reviewer": "OLLAMA_MODEL_REVIEWER_REVIEWER",
    "big-brother": "OLLAMA_MODEL_BIG_BROTHER",
};
/**
 * Resolve which Ollama model to use for a given agent.
 * Fallback chain: per-agent env var → OLLAMA_MODEL → hardcoded default.
 */
export function resolveOllamaModel(agentId) {
    if (agentId) {
        const envKey = AGENT_MODEL_ENV_KEYS[agentId];
        if (envKey && process.env[envKey]) {
            return process.env[envKey];
        }
    }
    return process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL;
}
export function createOllamaClient(baseUrl, model, agentId) {
    const url = baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
    const mdl = model ?? resolveOllamaModel(agentId);
    async function call(messages) {
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
        const data = JSON.parse(raw);
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
        sendMessage(systemPrompt, userMessage) {
            return call([
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage },
            ]);
        },
        sendMessages(systemPrompt, messages) {
            const mapped = messages.map((m) => ({
                role: m.role,
                content: typeof m.content === "string"
                    ? m.content
                    : m.content
                        .filter((b) => b.type === "text")
                        .map((b) => b.text)
                        .join(""),
            }));
            return call([{ role: "system", content: systemPrompt }, ...mapped]);
        },
    };
}
