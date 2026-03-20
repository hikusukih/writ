import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
export async function listScripts(scriptsDir) {
    const entries = await readdir(scriptsDir);
    const scripts = [];
    for (const entry of entries) {
        if (!entry.endsWith(".sh"))
            continue;
        const path = join(scriptsDir, entry);
        const content = await readFile(path, "utf-8");
        const info = parseScriptFrontmatter(content, entry, path);
        if (info)
            scripts.push(info);
    }
    return scripts;
}
export function parseScriptFrontmatter(content, filename, path) {
    const lines = content.split("\n");
    let name = filename.replace(".sh", "");
    let description = "";
    const params = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("#"))
            break;
        const nameMatch = trimmed.match(/^#\s*@name\s+(.+)/);
        if (nameMatch) {
            name = nameMatch[1].trim();
            continue;
        }
        const descMatch = trimmed.match(/^#\s*@description\s+(.+)/);
        if (descMatch) {
            description = descMatch[1].trim();
            continue;
        }
        const paramMatch = trimmed.match(/^#\s*@param\s+(.+)/);
        if (paramMatch) {
            params.push(paramMatch[1].trim());
            continue;
        }
    }
    return {
        id: name,
        name,
        description,
        params,
        path,
    };
}
