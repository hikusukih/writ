import type { IOAdapter } from "./IOAdapter.js";
export interface CLIAdapterOptions {
    prompt?: string;
}
/**
 * CLI implementation of IOAdapter. Wraps Node's readline for inbound input
 * and console for outbound output.
 */
export declare function createCLIAdapter(options?: CLIAdapterOptions): IOAdapter;
