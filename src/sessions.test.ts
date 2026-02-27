import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { loadSession, saveSession } from "./sessions.js";
import type { MessageParam } from "./agents/claude-client.js";

function tempDir(): string {
  return resolve(tmpdir(), `sessions-test-${randomUUID()}`);
}

describe("loadSession", () => {
  it("returns empty array when file does not exist", async () => {
    const dir = tempDir();
    const result = await loadSession(dir);
    expect(result).toEqual([]);
  });

  it("returns empty array when file contains invalid JSON", async () => {
    const dir = tempDir();
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, "current.json"), "not json");
    const result = await loadSession(dir);
    expect(result).toEqual([]);
  });

  it("returns empty array when file fails schema validation", async () => {
    const dir = tempDir();
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, "current.json"), JSON.stringify([{ role: "robot", content: "hi" }]));
    const result = await loadSession(dir);
    expect(result).toEqual([]);
  });

  it("returns parsed history for a valid session file", async () => {
    const dir = tempDir();
    const history: MessageParam[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ];
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, "current.json"), JSON.stringify(history));
    const result = await loadSession(dir);
    expect(result).toEqual(history);
  });

  it("uses the provided filename", async () => {
    const dir = tempDir();
    const history: MessageParam[] = [{ role: "user", content: "test" }];
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, "custom.json"), JSON.stringify(history));
    const result = await loadSession(dir, "custom.json");
    expect(result).toEqual(history);
  });
});

describe("saveSession", () => {
  it("creates the directory if it does not exist", async () => {
    const dir = tempDir();
    const history: MessageParam[] = [{ role: "user", content: "hello" }];
    await saveSession(dir, history);
    const loaded = await loadSession(dir);
    expect(loaded).toEqual(history);
  });

  it("round-trips history correctly", async () => {
    const dir = tempDir();
    const history: MessageParam[] = [
      { role: "user", content: "what is the weather?" },
      { role: "assistant", content: "It is sunny." },
      { role: "user", content: "thanks" },
      { role: "assistant", content: "You're welcome." },
    ];
    await saveSession(dir, history);
    const loaded = await loadSession(dir);
    expect(loaded).toEqual(history);
  });

  it("overwrites a previous session", async () => {
    const dir = tempDir();
    const first: MessageParam[] = [{ role: "user", content: "first" }];
    const second: MessageParam[] = [{ role: "user", content: "second" }];
    await saveSession(dir, first);
    await saveSession(dir, second);
    const loaded = await loadSession(dir);
    expect(loaded).toEqual(second);
  });

  it("saves empty array to clear a session", async () => {
    const dir = tempDir();
    const history: MessageParam[] = [{ role: "user", content: "hello" }];
    await saveSession(dir, history);
    await saveSession(dir, []);
    const loaded = await loadSession(dir);
    expect(loaded).toEqual([]);
  });
});
