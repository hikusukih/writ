import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { MessageParam } from "./agents/claude-client.js";
import { SessionSchema } from "./schemas.js";

export async function loadSession(
  dir: string,
  filename = "current.json"
): Promise<MessageParam[]> {
  const filePath = resolve(dir, filename);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`[sessions] Warning: session file at ${filePath} is not valid JSON. Starting fresh.`);
    return [];
  }
  const result = SessionSchema.safeParse(parsed);
  if (!result.success) {
    console.warn(`[sessions] Warning: session file at ${filePath} failed schema validation. Starting fresh.`);
    return [];
  }
  return result.data;
}

export async function saveSession(
  dir: string,
  history: MessageParam[],
  filename = "current.json"
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, filename), JSON.stringify(history));
}
