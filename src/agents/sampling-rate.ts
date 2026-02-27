import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AgentClass, SamplingRateState } from "../types.js";
import { easternTimestamp } from "../logger.js";

const STATE_FILE = "review-state.json";

const DEFAULT_STATE: SamplingRateState = {
  rates: {},
  defaults: {
    floor: 0.05,
    osFloor: 0.15,
    initialRate: 1.0,
    decayPerClean: 0.05,
  },
};

/**
 * Load sampling rate state from disk. Returns defaults if file is missing.
 */
export async function loadSamplingState(runtimeDir: string): Promise<SamplingRateState> {
  try {
    const content = await readFile(join(runtimeDir, STATE_FILE), "utf-8");
    return JSON.parse(content) as SamplingRateState;
  } catch {
    return { ...DEFAULT_STATE, rates: {} };
  }
}

/**
 * Save sampling rate state to disk.
 */
export async function saveSamplingState(
  state: SamplingRateState,
  runtimeDir: string
): Promise<void> {
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(join(runtimeDir, STATE_FILE), JSON.stringify(state, null, 2));
}

/**
 * Get the current sampling rate for an agent. OS-class agents use osFloor minimum.
 */
export function getRate(
  state: SamplingRateState,
  agentId: string,
  agentClass: AgentClass
): number {
  const entry = state.rates[agentId];
  const floor = agentClass === "os" ? state.defaults.osFloor : state.defaults.floor;

  if (!entry) {
    return state.defaults.initialRate;
  }

  return Math.max(entry.rate, floor);
}

/**
 * Record a clean (non-flagged) review. Decays rate toward floor.
 * Returns a new state (immutable update).
 */
export function recordClean(
  state: SamplingRateState,
  agentId: string,
  agentClass: AgentClass
): SamplingRateState {
  const floor = agentClass === "os" ? state.defaults.osFloor : state.defaults.floor;
  const entry = state.rates[agentId] ?? { rate: state.defaults.initialRate, cleanCount: 0 };
  const newRate = Math.max(entry.rate - state.defaults.decayPerClean, floor);

  return {
    ...state,
    rates: {
      ...state.rates,
      [agentId]: {
        ...entry,
        rate: newRate,
        cleanCount: entry.cleanCount + 1,
      },
    },
  };
}

/**
 * Record a flagged review. Resets rate to initialRate and clears cleanCount.
 * Returns a new state (immutable update).
 */
export function recordFlag(
  state: SamplingRateState,
  agentId: string
): SamplingRateState {
  return {
    ...state,
    rates: {
      ...state.rates,
      [agentId]: {
        rate: state.defaults.initialRate,
        cleanCount: 0,
        lastFlagTimestamp: easternTimestamp(),
      },
    },
  };
}

/**
 * Reset rate to high (initialRate) on context change — e.g., config edit, new script.
 * Returns a new state (immutable update).
 */
export function resetOnContextChange(
  state: SamplingRateState,
  agentId: string
): SamplingRateState {
  const entry = state.rates[agentId];
  return {
    ...state,
    rates: {
      ...state.rates,
      [agentId]: {
        rate: state.defaults.initialRate,
        cleanCount: 0,
        lastFlagTimestamp: entry?.lastFlagTimestamp,
      },
    },
  };
}
