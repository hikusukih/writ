import { createInterface } from "node:readline";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { appendFile, mkdir } from "node:fs/promises";
import { config } from "dotenv";
import { loadIdentity } from "./identity/loader.js";
import { createLLMClient, getActiveModel } from "./agents/claude-client.js";
import { handleRequest } from "./agents/orchestrator.js";
import { reviewOutput } from "./agents/reviewer.js";
import { setVerbose, verbose, easternTimestamp } from "./logger.js";
config(); // Load .env
const VERSION = "0.1.0";
const __dirname = dirname(fileURLToPath(import.meta.url));
const IDENTITY_DIR = resolve(__dirname, "instance", "identity");
const SCRIPTS_DIR = resolve(__dirname, "instance", "scripts");
const PLANS_DIR = resolve("runtime/plans");
const LOGS_DIR = resolve("runtime/logs");
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
    console.log(`DomestiClaw v${VERSION}`);
    const provider = process.env.LLM_PROVIDER ?? "anthropic";
    if (provider !== "ollama" && !process.env.ANTHROPIC_API_KEY) {
        console.error("Error: ANTHROPIC_API_KEY not set. Copy .env.example to .env and add your key.");
        process.exit(1);
    }
    let identity;
    try {
        identity = await loadIdentity(IDENTITY_DIR);
    }
    catch (err) {
        console.error(`Error loading identity files from ${IDENTITY_DIR}:`, err);
        process.exit(1);
    }
    await mkdir(PLANS_DIR, { recursive: true });
    const client = createLLMClient();
    const model = getActiveModel();
    console.log(`Loaded ${identity.agents.length} agents from registry.`);
    console.log(`Provider: ${process.env.LLM_PROVIDER ?? "anthropic"} | Model: ${model}`);
    if (skipReview)
        console.log("[--no-review] Reviewer disabled.");
    if (verboseMode)
        console.log("[--verbose] Verbose mode on — detailed trace goes to stderr.");
    console.log("Type your request, or Ctrl+D to exit. /clear to reset history.\n");
    verbose("Startup", {
        provider: process.env.LLM_PROVIDER ?? "anthropic",
        model,
        skipReview,
        identityDir: IDENTITY_DIR,
        scriptsDir: SCRIPTS_DIR,
        plansDir: PLANS_DIR,
    });
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        // TODO: Make this the name of the Agent as named by the user (probably from SOUL.md)
        prompt: "domesticlaw> ",
    });
    let conversationHistory = [];
    rl.prompt();
    rl.on("line", async (line) => {
        const input = line.trim();
        if (!input) {
            rl.prompt();
            return;
        }
        if (input === "/clear") {
            conversationHistory = [];
            console.log("\nConversation history cleared.\n");
            rl.prompt();
            return;
        }
        const startTime = Date.now();
        verbose("User input", input);
        try {
            const result = await handleRequest(client, input, identity, SCRIPTS_DIR, PLANS_DIR, conversationHistory);
            verbose("handleRequest result", {
                response: result.response,
                provenance: result.provenance,
                durationMs: Date.now() - startTime,
            });
            // Review the final output
            if (!skipReview) {
                const review = reviewOutput(result.response, identity);
                if (review.decision === "flag-and-halt") {
                    console.log(`\n[REVIEW BLOCKED] ${review.reasoning}\n` +
                        `Matched rules: ${review.matchedRules?.join(", ")}\n`);
                    await appendLog({
                        input,
                        model,
                        review: review.decision,
                        reasoning: review.reasoning,
                        durationMs: Date.now() - startTime,
                    });
                    rl.prompt();
                    return;
                }
            }
            // Accumulate conversation history with what the user actually said and
            // what the orchestrator returned to the user.
            // TODO: also append a summary of confirmed side effects (scripts run,
            // files written, etc.) once execution provenance is richer.
            conversationHistory.push({ role: "user", content: input }, { role: "assistant", content: result.response });
            // Display response
            console.log(`\n${result.response}`);
            // Display provenance
            const chain = result.provenance.map((p) => p.agentId).join(" → ");
            console.log(`\n[${chain}]\n`);
            await appendLog({
                input,
                model,
                response: result.response,
                provenance: result.provenance,
                review: skipReview ? "skipped" : "allow",
                durationMs: Date.now() - startTime,
            });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const stack = err instanceof Error ? err.stack : undefined;
            verbose("Error thrown", { message, stack });
            console.error(`\nError: ${message}\n`);
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
        rl.prompt();
    });
    rl.on("close", () => {
        console.log("\nGoodbye.");
        process.exit(0);
    });
    // Handle Ctrl+C gracefully
    rl.on("SIGINT", () => {
        rl.close();
    });
}
main();
