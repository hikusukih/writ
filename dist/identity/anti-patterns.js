import { appendFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
/**
 * Append a timestamped anti-pattern entry to the agent's anti-pattern file.
 * Creates the file with a header if it doesn't exist.
 */
export async function appendAntiPattern(basePath, agentId, entry) {
    const filePath = join(basePath, `anti-patterns-${agentId}.md`);
    const timestamp = new Date().toISOString();
    const formattedEntry = `\n- [${timestamp}] ${entry}\n`;
    try {
        await access(filePath);
        await appendFile(filePath, formattedEntry);
    }
    catch {
        // File doesn't exist — create with header
        const header = `# Anti-Patterns: ${agentId}\n\n<!-- Append-only log of known anti-patterns. Populated by BIG_BROTHER. -->\n`;
        await writeFile(filePath, header + formattedEntry);
    }
}
