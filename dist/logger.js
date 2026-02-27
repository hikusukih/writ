import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
let _verbose = false;
let _logFile = null;
const LOGS_DIR = resolve("runtime/logs");
const VERBOSE_LOG = resolve(LOGS_DIR, "verbose.log");
export function setVerbose(flag) {
    _verbose = flag;
    if (flag) {
        _logFile = VERBOSE_LOG;
    }
}
export function isVerbose() {
    return _verbose;
}
/** Format a Date as a human-readable Eastern time string. */
export function easternTimestamp(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} ET`;
}
/**
 * Write a verbose log entry. No-op unless --verbose was passed.
 * Writes to runtime/logs/verbose.log AND stderr so it's visible in the terminal.
 *
 * @param label Short description of the event.
 * @param data  Optional payload — strings printed as-is, objects as pretty JSON.
 */
export function verbose(label, data) {
    if (!_verbose)
        return;
    const ts = easternTimestamp();
    const header = `\n[VERBOSE ${ts}] ${label}\n`;
    const body = data === undefined
        ? ""
        : typeof data === "string"
            ? data + "\n"
            : JSON.stringify(data, null, 2) + "\n";
    const line = header + body;
    // Always write to stderr so it's visible live in the terminal
    process.stderr.write(line);
    // Also append to the verbose log file (fire-and-forget; never throw)
    if (_logFile) {
        mkdir(LOGS_DIR, { recursive: true })
            .then(() => appendFile(_logFile, line))
            .catch(() => {
            // Don't let log I/O errors surface
        });
    }
}
