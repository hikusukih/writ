#!/usr/bin/env node
// Summarize agent.jsonl and write a pretty agent-log.json for browsing in VSCode.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const JSONL = resolve("runtime/logs/agent.jsonl");
const OUT = resolve("runtime/logs/agent-log.json");

let raw;
try {
  raw = readFileSync(JSONL, "utf8");
} catch {
  console.error(`No log file found at ${JSONL} — run the agent first.`);
  process.exit(1);
}

const entries = raw
  .trim()
  .split("\n")
  .filter(Boolean)
  .map(JSON.parse);

if (entries.length === 0) {
  console.log("Log file is empty.");
  process.exit(0);
}

const errors = entries.filter((e) => e.error);
const first = entries[0].timestamp.slice(0, 10);
const last = entries[entries.length - 1].timestamp.slice(0, 10);
const dateRange = first === last ? first : `${first} → ${last}`;

console.log(`\n${entries.length} entries (${errors.length} errors) | ${dateRange}\n`);

for (const e of entries) {
  const time = e.timestamp.slice(11, 19);
  const input = e.input ? `"${e.input.slice(0, 50)}${e.input.length > 50 ? "…" : ""}"` : "(no input)";
  const dur = e.durationMs != null ? `${(e.durationMs / 1000).toFixed(1)}s` : "—";

  let status;
  if (e.error) {
    status = `ERROR: ${e.error.slice(0, 60)}`;
  } else if (e.review === "flag-and-halt") {
    status = "flag-and-halt";
  } else {
    status = e.review ?? "—";
  }

  const model = e.model ?? "—";
  const inputCol = input.padEnd(55);
  const durCol = dur.padStart(5);
  console.log(`  ${time}  ${inputCol}  ${durCol}  ${model}  ${status}`);
}

writeFileSync(OUT, JSON.stringify(entries, null, 2));
console.log(`\nWritten: ${OUT}\n`);
