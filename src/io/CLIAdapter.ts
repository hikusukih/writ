import { createInterface } from "node:readline";
import type { IOAdapter } from "./IOAdapter.js";

export interface CLIAdapterOptions {
  prompt?: string;
}

/**
 * CLI implementation of IOAdapter. Wraps Node's readline for inbound input
 * and console for outbound output.
 */
export function createCLIAdapter(options: CLIAdapterOptions = {}): IOAdapter {
  const prompt = options.prompt ?? "> ";
  let rl: ReturnType<typeof createInterface> | null = null;
  let requestHandler: ((input: string) => Promise<void>) | null = null;

  return {
    sendResult(response: string, provenanceChain: string): void {
      console.log(`\n${response}`);
      console.log(`\n[${provenanceChain}]\n`);
    },

    sendError(message: string): void {
      console.error(`\nError: ${message}\n`);
    },

    sendReviewBlock(reasoning: string, matchedRules?: string[]): void {
      const rulesLine = matchedRules?.length
        ? `Matched rules: ${matchedRules.join(", ")}\n`
        : "";
      console.log(`\n[REVIEW BLOCKED] ${reasoning}\n${rulesLine}`);
    },

    sendStatus(message: string): void {
      console.log(message);
    },

    requestConfirmation(summary: string, details?: string): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
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
          if (!answered) resolve(false);
        });
      });
    },

    onRequest(handler: (input: string) => Promise<void>): void {
      requestHandler = handler;
    },

    start(): Promise<void> {
      return new Promise<void>((resolve) => {
        rl = createInterface({
          input: process.stdin,
          output: process.stdout,
          prompt,
        });

        rl.prompt();

        rl.on("line", async (line: string) => {
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

    stop(): void {
      rl?.close();
      rl = null;
    },
  };
}
