import { writeFile, rename, copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { easternTimestamp } from "../logger.js";
/**
 * Basic sanity check: content must be non-empty and start with a markdown heading.
 */
function validateConfigContent(content) {
    const trimmed = content.trim();
    if (!trimmed) {
        throw new Error("Config content is empty or whitespace-only");
    }
    if (!trimmed.startsWith("#")) {
        throw new Error("Config content must start with a markdown heading (# ...)");
    }
}
/**
 * Backup a config file before overwriting it.
 * Creates backup at `runtimeDir/config-backups/{agentId}-{timestamp}.md`.
 * Silently skips if original doesn't exist (e.g., creating a new config).
 */
export async function backupConfig(identityDir, configFile, runtimeDir) {
    const backupDir = join(runtimeDir, "config-backups");
    await mkdir(backupDir, { recursive: true });
    const timestamp = easternTimestamp().replace(/[: ]/g, "-");
    const backupName = `${configFile.replace(".md", "")}-${timestamp}.md`;
    try {
        await copyFile(join(identityDir, "agents", configFile), join(backupDir, backupName));
    }
    catch {
        // Original may not exist — that's ok for new configs
    }
}
/**
 * Write an agent config to disk atomically (via .pending temp file).
 * Validates content sanity before writing.
 */
export async function writeAgentConfig(identityDir, configFile, content, runtimeDir) {
    validateConfigContent(content);
    if (runtimeDir) {
        await backupConfig(identityDir, configFile, runtimeDir);
    }
    const agentsDir = join(identityDir, "agents");
    await mkdir(agentsDir, { recursive: true });
    const pendingPath = join(agentsDir, `${configFile}.pending`);
    const finalPath = join(agentsDir, configFile);
    await writeFile(pendingPath, content);
    await rename(pendingPath, finalPath);
}
/**
 * Write a reviewer config to disk atomically.
 * Config file is `{agentId}-reviewer-agent.md`.
 */
export async function writeReviewerConfig(identityDir, agentId, content, runtimeDir) {
    const configFile = `${agentId}-reviewer-agent.md`;
    await writeAgentConfig(identityDir, configFile, content, runtimeDir);
}
