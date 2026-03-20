import type { AgentClass, SamplingRateState } from "../types.js";
/**
 * Load sampling rate state from disk. Returns defaults if file is missing.
 */
export declare function loadSamplingState(runtimeDir: string): Promise<SamplingRateState>;
/**
 * Save sampling rate state to disk.
 */
export declare function saveSamplingState(state: SamplingRateState, runtimeDir: string): Promise<void>;
/**
 * Get the current sampling rate for an agent. OS-class agents use osFloor minimum.
 */
export declare function getRate(state: SamplingRateState, agentId: string, agentClass: AgentClass): number;
/**
 * Record a clean (non-flagged) review. Decays rate toward floor.
 * Returns a new state (immutable update).
 */
export declare function recordClean(state: SamplingRateState, agentId: string, agentClass: AgentClass): SamplingRateState;
/**
 * Record a flagged review. Resets rate to initialRate and clears cleanCount.
 * Returns a new state (immutable update).
 */
export declare function recordFlag(state: SamplingRateState, agentId: string): SamplingRateState;
/**
 * Reset rate to high (initialRate) on context change — e.g., config edit, new script.
 * Returns a new state (immutable update).
 */
export declare function resetOnContextChange(state: SamplingRateState, agentId: string): SamplingRateState;
