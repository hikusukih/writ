import { describe, it, expect, vi, afterEach } from "vitest";
import { createOllamaClient, resolveOllamaModel } from "./ollama-client.js";

function makeFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => body,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("createOllamaClient", () => {
  it("sendMessage posts correct payload and maps response", async () => {
    const ollamaResponse = {
      message: { role: "assistant", content: "Hello!" },
      prompt_eval_count: 10,
      eval_count: 5,
    };
    const mockFetch = makeFetch(200, ollamaResponse);
    vi.stubGlobal("fetch", mockFetch);

    const client = createOllamaClient("http://localhost:11434", "llama3.2");
    const result = await client.sendMessage("You are helpful.", "Say hello.");

    expect(result.content).toBe("Hello!");
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(5);

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:11434/api/chat");
    const body = JSON.parse(options.body as string);
    expect(body.model).toBe("llama3.2");
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Say hello." },
    ]);
  });

  it("sendMessages prepends system prompt and maps MessageParam array", async () => {
    const ollamaResponse = {
      message: { content: "Got it." },
      prompt_eval_count: 20,
      eval_count: 8,
    };
    vi.stubGlobal("fetch", makeFetch(200, ollamaResponse));

    const client = createOllamaClient("http://localhost:11434", "llama3.2");
    const result = await client.sendMessages("System prompt.", [
      { role: "user", content: "First message." },
      { role: "assistant", content: "First reply." },
      { role: "user", content: "Second message." },
    ]);

    expect(result.content).toBe("Got it.");
    expect(result.inputTokens).toBe(20);
    expect(result.outputTokens).toBe(8);

    const [, options] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(options.body as string);
    expect(body.messages).toEqual([
      { role: "system", content: "System prompt." },
      { role: "user", content: "First message." },
      { role: "assistant", content: "First reply." },
      { role: "user", content: "Second message." },
    ]);
  });

  it("throws a descriptive error on non-OK response", async () => {
    vi.stubGlobal("fetch", makeFetch(503, "Service Unavailable"));

    const client = createOllamaClient("http://localhost:11434", "llama3.2");
    await expect(client.sendMessage("sys", "user")).rejects.toThrow(
      "Ollama error: 503"
    );
  });

  it("defaults inputTokens and outputTokens to 0 when counts are absent", async () => {
    const ollamaResponse = { message: { content: "ok" } };
    vi.stubGlobal("fetch", makeFetch(200, ollamaResponse));

    const client = createOllamaClient("http://localhost:11434", "llama3.2");
    const result = await client.sendMessage("sys", "user");

    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  it("uses env vars for base URL and model when not passed as args", async () => {
    const ollamaResponse = { message: { content: "env defaults" } };
    const mockFetch = makeFetch(200, ollamaResponse);
    vi.stubGlobal("fetch", mockFetch);
    vi.stubEnv("OLLAMA_BASE_URL", "http://custom-host:11434");
    vi.stubEnv("OLLAMA_MODEL", "mistral");

    const client = createOllamaClient();
    await client.sendMessage("sys", "user");

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://custom-host:11434/api/chat");
    const body = JSON.parse(options.body as string);
    expect(body.model).toBe("mistral");
  });

  it("uses per-agent env var when agentId is provided", async () => {
    const ollamaResponse = { message: { content: "agent model" } };
    const mockFetch = makeFetch(200, ollamaResponse);
    vi.stubGlobal("fetch", mockFetch);
    vi.stubEnv("OLLAMA_MODEL", "mistral");
    vi.stubEnv("OLLAMA_MODEL_PLANNER", "qwen2.5-coder:7b-instruct");

    const client = createOllamaClient(undefined, undefined, "planner");
    await client.sendMessage("sys", "user");

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.model).toBe("qwen2.5-coder:7b-instruct");
  });
});

describe("resolveOllamaModel", () => {
  it("falls back to hardcoded default when no env vars are set", () => {
    expect(resolveOllamaModel()).toBe("llama3.1:8b");
    expect(resolveOllamaModel(undefined)).toBe("llama3.1:8b");
    expect(resolveOllamaModel("orchestrator")).toBe("llama3.1:8b");
  });

  it("uses OLLAMA_MODEL when no per-agent var is set", () => {
    vi.stubEnv("OLLAMA_MODEL", "mistral:7b");
    expect(resolveOllamaModel()).toBe("mistral:7b");
    expect(resolveOllamaModel("orchestrator")).toBe("mistral:7b");
    expect(resolveOllamaModel("planner")).toBe("mistral:7b");
  });

  it("uses per-agent env var overriding OLLAMA_MODEL", () => {
    vi.stubEnv("OLLAMA_MODEL", "mistral:7b");
    vi.stubEnv("OLLAMA_MODEL_ORCHESTRATOR", "llama3.1:8b");
    vi.stubEnv("OLLAMA_MODEL_PLANNER", "qwen2.5-coder:7b-instruct");

    expect(resolveOllamaModel("orchestrator")).toBe("llama3.1:8b");
    expect(resolveOllamaModel("planner")).toBe("qwen2.5-coder:7b-instruct");
    // Agent without override falls back to global
    expect(resolveOllamaModel("executor")).toBe("mistral:7b");
  });

  it("uses per-agent env var without global OLLAMA_MODEL", () => {
    vi.stubEnv("OLLAMA_MODEL_DEVELOPER_WRITER", "qwen2.5-coder:7b-instruct");

    expect(resolveOllamaModel("developer-writer")).toBe("qwen2.5-coder:7b-instruct");
    // Other agents fall back to hardcoded default
    expect(resolveOllamaModel("orchestrator")).toBe("llama3.1:8b");
  });

  it("falls back for unknown agent IDs", () => {
    vi.stubEnv("OLLAMA_MODEL", "mistral:7b");
    expect(resolveOllamaModel("unknown-agent")).toBe("mistral:7b");
  });

  it("lieutenant-planner uses its own env var", () => {
    vi.stubEnv("OLLAMA_MODEL_LIEUTENANT_PLANNER", "qwen2.5-coder:7b-instruct");
    expect(resolveOllamaModel("lieutenant-planner")).toBe("qwen2.5-coder:7b-instruct");
  });
});
