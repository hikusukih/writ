import { createInterface } from "node:readline";
/**
 * CLI implementation of IOAdapter. Wraps Node's readline for inbound input
 * and console for outbound output.
 */
export function createCLIAdapter(options = {}) {
    const prompt = options.prompt ?? "> ";
    let rl = null;
    let requestHandler = null;
    return {
        sendResult(response, provenanceChain) {
            console.log(`\n${response}`);
            console.log(`\n[${provenanceChain}]\n`);
        },
        sendError(message) {
            console.error(`\nError: ${message}\n`);
        },
        sendReviewBlock(reasoning, matchedRules) {
            const rulesLine = matchedRules?.length
                ? `Matched rules: ${matchedRules.join(", ")}\n`
                : "";
            console.log(`\n[REVIEW BLOCKED] ${reasoning}\n${rulesLine}`);
        },
        sendStatus(message) {
            console.log(message);
        },
        sendAcknowledgment(message) {
            console.log(message);
        },
        sendProgress(jobId, message) {
            console.log(`[${jobId}] ${message}`);
        },
        requestConfirmation(summary, details) {
            return new Promise((resolve) => {
                console.log(`\n[CONFIRMATION REQUIRED] ${summary}`);
                if (details) {
                    console.log(`Details: ${details}`);
                }
                let answered = false;
                const tempRl = createInterface({ input: process.stdin, output: process.stdout });
                tempRl.question("Approve? [y/N]: ", (answer) => {
                    answered = true;
                    tempRl.close();
                    const normalized = answer.trim().toLowerCase();
                    resolve(normalized === "y" || normalized === "yes");
                });
                // Handle EOF — deny by default
                tempRl.on("close", () => {
                    if (!answered)
                        resolve(false);
                });
            });
        },
        onRequest(handler) {
            requestHandler = handler;
        },
        start() {
            return new Promise((resolve) => {
                rl = createInterface({
                    input: process.stdin,
                    output: process.stdout,
                    prompt,
                });
                rl.prompt();
                rl.on("line", async (line) => {
                    const input = line.trim();
                    if (!input) {
                        rl?.prompt();
                        return;
                    }
                    if (requestHandler) {
                        await requestHandler(input);
                    }
                    rl?.prompt();
                });
                rl.on("close", () => {
                    console.log("\nGoodbye.");
                    resolve();
                });
                rl.on("SIGINT", () => {
                    rl?.close();
                });
            });
        },
        stop() {
            rl?.close();
            rl = null;
        },
    };
}
