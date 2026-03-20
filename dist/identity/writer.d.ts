/**
 * Backup a config file before overwriting it.
 * Creates backup at `runtimeDir/config-backups/{agentId}-{timestamp}.md`.
 * Silently skips if original doesn't exist (e.g., creating a new config).
 */
export declare function backupConfig(identityDir: string, configFile: string, runtimeDir: string): Promise<void>;
/**
 * Write an agent config to disk atomically (via .pending temp file).
 * Validates content sanity before writing.
 */
export declare function writeAgentConfig(identityDir: string, configFile: string, content: string, runtimeDir?: string): Promise<void>;
/**
 * Write a reviewer config to disk atomically.
 * Config file is `{agentId}-reviewer-agent.md`.
 */
export declare function writeReviewerConfig(identityDir: string, agentId: string, content: string, runtimeDir?: string): Promise<void>;
