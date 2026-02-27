export declare function setVerbose(flag: boolean): void;
export declare function isVerbose(): boolean;
/** Format a Date as a human-readable Eastern time string. */
export declare function easternTimestamp(date?: Date): string;
/**
 * Write a verbose log entry. No-op unless --verbose was passed.
 * Writes to runtime/logs/verbose.log AND stderr so it's visible in the terminal.
 *
 * @param label Short description of the event.
 * @param data  Optional payload — strings printed as-is, objects as pretty JSON.
 */
export declare function verbose(label: string, data?: unknown): void;
