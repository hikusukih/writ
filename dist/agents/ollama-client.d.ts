import type { LLMClient } from "./claude-client.js";
/**
 * Resolve which Ollama model to use for a given agent.
 * Fallback chain: per-agent env var → OLLAMA_MODEL → hardcoded default.
 */
export declare function resolveOllamaModel(agentId?: string): string;
export declare function createOllamaClient(baseUrl?: string, model?: string, agentId?: string): LLMClient;
