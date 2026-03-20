/**
 * Append a timestamped anti-pattern entry to the agent's anti-pattern file.
 * Creates the file with a header if it doesn't exist.
 */
export declare function appendAntiPattern(basePath: string, agentId: string, entry: string): Promise<void>;
