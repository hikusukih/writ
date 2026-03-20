import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { SessionSchema } from "./schemas.js";
export async function loadSession(dir, filename = "current.json") {
    const filePath = resolve(dir, filename);
    let raw;
    try {
        raw = await readFile(filePath, "utf-8");
    }
    catch {
        return [];
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
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
export async function saveSession(dir, history, filename = "current.json") {
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, filename), JSON.stringify(history));
}
