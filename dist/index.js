import { createInterface } from "node:readline";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { appendFile, mkdir } from "node:fs/promises";
import { config } from "dotenv";
import { loadIdentity } from "./identity/loader.js";
import { loadSession, saveSession } from "./sessions.js";
import { createLLMClient, getActiveModel } from "./agents/claude-client.js";
import { handleRequest } from "./agents/orchestrator.js";
import { ReviewHaltError } from "./agents/reviewed.js";
import { sampleAndAudit } from "./agents/reviewer-reviewer.js";
import { setVerbose, verbose, easternTimestamp } from "./logger.js";
import { createCLIAdapter } from "./io/CLIAdapter.js";
import { createJobStore } from "./jobs/store.js";
import { createScheduler } from "./jobs/scheduler.js";
import { createDefaultJobExecutor } from "./jobs/defaultExecutor.js";
config(); // Load .env
const VERSION = "0.1.0";
const __dirname = dirname(fileURLToPath(import.meta.url));
const IDENTITY_DIR = resolve(__dirname, "instance", "identity");
const SCRIPTS_DIR = resolve(__dirname, "instance", "scripts");
const PLANS_DIR = resolve("runtime/plans");
const LOGS_DIR = resolve("runtime/logs");
const SESSIONS_DIR = resolve("runtime/sessions");
const JOBS_DIR = resolve("runtime/jobs");
const skipReview = process.argv.includes("--no-review");
const verboseMode = process.argv.includes("--verbose");
if (verboseMode)
    setVerbose(true);
async function appendLog(entry) {
    await mkdir(LOGS_DIR, { recursive: true });
    const line = JSON.stringify({ timestamp: easternTimestamp(), ...entry });
    await appendFile(resolve(LOGS_DIR, "agent.jsonl"), line + "\n");
}
async function main() {
    const adapter = createCLIAdapter({
        // TODO: Make this the name of the Agent as named by the user (probably from SOUL.md)
        prompt: "writ> ",
    });
    adapter.sendStatus(`Writ v${VERSION}`);
    const provider = process.env.LLM_PROVIDER ?? "anthropic";
    if (provider !== "ollama" && !process.env.ANTHROPIC_API_KEY) {
        adapter.sendError("ANTHROPIC_API_KEY not set. Copy .env.example to .env and add your key.");
        process.exit(1);
    }
    let identity;
    try {
        identity = await loadIdentity(IDENTITY_DIR);
    }
    catch (err) {
        adapter.sendError(`Error loading identity files from ${IDENTITY_DIR}: ${err}`);
        process.exit(1);
    }
    await mkdir(PLANS_DIR, { recursive: true });
    await mkdir(JOBS_DIR, { recursive: true });
    const client = createLLMClient();
    const model = getActiveModel();
    adapter.sendStatus(`Loaded ${identity.agents.length} agents from registry.`);
    adapter.sendStatus(`Provider: ${process.env.LLM_PROVIDER ?? "anthropic"} | Model: ${model}`);
    const jobStore = await createJobStore(JOBS_DIR);
    const jobExecutor = createDefaultJobExecutor({
        client,
        identity,
        scriptsDir: SCRIPTS_DIR,
        plansDir: PLANS_DIR,
        skipReview,
        getStore: () => jobStore,
    });
    const scheduler = createScheduler(jobStore, jobExecutor, adapter);
    if (skipReview)
        adapter.sendStatus("[--no-review] Reviewer disabled.");
    if (verboseMode)
        adapter.sendStatus("[--verbose] Verbose mode on — detailed trace goes to stderr.");
    // Offer to restore previous session (temporary readline — bootstrapper logic,
    // not ongoing I/O, so handled before the adapter starts)
    const restored = await loadSession(SESSIONS_DIR);
    let conversationHistory = [];
    if (restored.length > 0) {
        const turnCount = Math.floor(restored.length / 2);
        const answer = await new Promise((res) => {
            const tempRl = createInterface({ input: process.stdin, output: process.stdout });
            tempRl.question(`Previous session found (${turnCount} turn${turnCount === 1 ? "" : "s"}). Resume? (y/n): `, (ans) => {
                tempRl.close();
                res(ans.trim().toLowerCase());
            });
        });
        if (answer === "y" || answer === "yes") {
            conversationHistory = restored;
            adapter.sendStatus("Session restored.\n");
        }
        else {
            adapter.sendStatus("Starting fresh session.\n");
        }
    }
    adapter.sendStatus("Type your request, or Ctrl+D to exit. /clear to reset history.\n");
    verbose("Startup", {
        provider: process.env.LLM_PROVIDER ?? "anthropic",
        model,
        skipReview,
        identityDir: IDENTITY_DIR,
        scriptsDir: SCRIPTS_DIR,
        plansDir: PLANS_DIR,
        sessionTurns: Math.floor(conversationHistory.length / 2),
    });
    adapter.onRequest(async (input) => {
        if (input === "/clear") {
            conversationHistory = [];
            saveSession(SESSIONS_DIR, []).catch((err) => adapter.sendError(`[sessions] Failed to clear session: ${err}`));
            adapter.sendStatus("\nConversation history cleared.\n");
            return;
        }
        const startTime = Date.now();
        verbose("User input", input);
        try {
            const result = await handleRequest(client, input, identity, SCRIPTS_DIR, PLANS_DIR, conversationHistory, skipReview, adapter, scheduler);
            verbose("handleRequest result", {
                response: result.response,
                provenance: result.provenance,
                durationMs: Date.now() - startTime,
            });
            // Accumulate conversation history with what the user actually said and
            // what the orchestrator returned to the user, plus a side-effect summary
            // so the model knows what scripts ran and what changed.
            const assistantContent = result.sideEffects
                ? `${result.response}\n\n[Side effects this turn: ${result.sideEffects}]`
                : result.response;
            conversationHistory.push({ role: "user", content: input }, { role: "assistant", content: assistantContent });
            // Persist session to disk (fire-and-forget — don't block the REPL)
            saveSession(SESSIONS_DIR, conversationHistory).catch((err) => adapter.sendError(`[sessions] Failed to save session: ${err}`));
            // Display response and provenance.
            // If the throbber fired (slow job), handleRequest() already called sendResult() on the adapter.
            if (!result.didAck) {
                const chain = result.provenance.map((p) => p.agentId).join(" → ");
                adapter.sendResult(result.response, chain);
            }
            await appendLog({
                input,
                model,
                historyLength: conversationHistory.length,
                response: result.response,
                provenance: result.provenance,
                review: skipReview ? "skipped" : "allow",
                durationMs: Date.now() - startTime,
            });
            // Fire-and-forget: sample a recent review decision for RR audit (don't block REPL)
            if (!skipReview) {
                sampleAndAudit(client, identity, adapter, LOGS_DIR, 1.0, {
                    identityDir: IDENTITY_DIR,
                    runtimeDir: "runtime",
                }).catch((err) => verbose("RR: audit error (non-blocking)", err instanceof Error ? err.message : String(err)));
            }
        }
        catch (err) {
            if (err instanceof ReviewHaltError) {
                adapter.sendReviewBlock(err.reasoning, err.matchedRules);
                try {
                    await appendLog({
                        input,
                        model,
                        review: "flag-and-halt",
                        reasoning: err.reasoning,
                        matchedRules: err.matchedRules,
                        durationMs: Date.now() - startTime,
                    });
                }
                catch {
                    // Don't let logging failures mask the review block
                }
            }
            else {
                const message = err instanceof Error ? err.message : String(err);
                const stack = err instanceof Error ? err.stack : undefined;
                verbose("Error thrown", { message, stack });
                adapter.sendError(message);
                try {
                    await appendLog({
                        input,
                        model,
                        error: message,
                        durationMs: Date.now() - startTime,
                    });
                }
                catch {
                    // Don't let logging failures mask the real error
                }
            }
        }
    });
    await adapter.start();
    process.exit(0);
}
main();
