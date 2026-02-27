import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadSamplingState,
  saveSamplingState,
  getRate,
  recordClean,
  recordFlag,
  resetOnContextChange,
} from "./sampling-rate.js";
import type { SamplingRateState } from "../types.js";

function makeState(overrides: Partial<SamplingRateState> = {}): SamplingRateState {
  return {
    rates: {},
    defaults: {
      floor: 0.05,
      osFloor: 0.15,
      initialRate: 1.0,
      decayPerClean: 0.05,
    },
    ...overrides,
  };
}

describe("getRate", () => {
  it("returns initialRate for unknown agents", () => {
    const state = makeState();
    expect(getRate(state, "planner", "planner")).toBe(1.0);
  });

  it("returns stored rate for known agents", () => {
    const state = makeState({
      rates: { planner: { rate: 0.5, cleanCount: 10 } },
    });
    expect(getRate(state, "planner", "planner")).toBe(0.5);
  });

  it("enforces floor for non-OS agents", () => {
    const state = makeState({
      rates: { planner: { rate: 0.01, cleanCount: 100 } },
    });
    expect(getRate(state, "planner", "planner")).toBe(0.05);
  });

  it("enforces osFloor for OS-class agents", () => {
    const state = makeState({
      rates: { orchestrator: { rate: 0.01, cleanCount: 100 } },
    });
    expect(getRate(state, "orchestrator", "os")).toBe(0.15);
  });
});

describe("recordClean", () => {
  it("decays rate by decayPerClean", () => {
    const state = makeState({
      rates: { planner: { rate: 0.5, cleanCount: 5 } },
    });
    const newState = recordClean(state, "planner", "planner");
    expect(newState.rates.planner.rate).toBe(0.45);
    expect(newState.rates.planner.cleanCount).toBe(6);
  });

  it("does not decay below floor", () => {
    const state = makeState({
      rates: { planner: { rate: 0.06, cleanCount: 50 } },
    });
    const newState = recordClean(state, "planner", "planner");
    expect(newState.rates.planner.rate).toBe(0.05);
  });

  it("does not decay below osFloor for OS agents", () => {
    const state = makeState({
      rates: { orchestrator: { rate: 0.16, cleanCount: 50 } },
    });
    const newState = recordClean(state, "orchestrator", "os");
    expect(newState.rates.orchestrator.rate).toBe(0.15);
  });

  it("initializes unknown agents at initialRate - decayPerClean", () => {
    const state = makeState();
    const newState = recordClean(state, "newagent", "action");
    expect(newState.rates.newagent.rate).toBe(0.95);
    expect(newState.rates.newagent.cleanCount).toBe(1);
  });
});

describe("recordFlag", () => {
  it("resets rate to initialRate and clears cleanCount", () => {
    const state = makeState({
      rates: { planner: { rate: 0.3, cleanCount: 14 } },
    });
    const newState = recordFlag(state, "planner");
    expect(newState.rates.planner.rate).toBe(1.0);
    expect(newState.rates.planner.cleanCount).toBe(0);
    expect(newState.rates.planner.lastFlagTimestamp).toBeDefined();
  });
});

describe("resetOnContextChange", () => {
  it("resets rate to initialRate and clears cleanCount", () => {
    const state = makeState({
      rates: { planner: { rate: 0.2, cleanCount: 16, lastFlagTimestamp: "old" } },
    });
    const newState = resetOnContextChange(state, "planner");
    expect(newState.rates.planner.rate).toBe(1.0);
    expect(newState.rates.planner.cleanCount).toBe(0);
    // Preserves lastFlagTimestamp
    expect(newState.rates.planner.lastFlagTimestamp).toBe("old");
  });
});

describe("persistence", () => {
  let runtimeDir: string;

  beforeAll(async () => {
    runtimeDir = await mkdtemp(join(tmpdir(), "domesticlaw-sr-"));
  });

  afterAll(async () => {
    await rm(runtimeDir, { recursive: true });
  });

  it("returns defaults when no state file exists", async () => {
    const state = await loadSamplingState(runtimeDir);
    expect(state.defaults.floor).toBe(0.05);
    expect(state.defaults.osFloor).toBe(0.15);
    expect(Object.keys(state.rates)).toHaveLength(0);
  });

  it("round-trips save/load correctly", async () => {
    const state = makeState({
      rates: {
        planner: { rate: 0.4, cleanCount: 12 },
        orchestrator: { rate: 0.8, cleanCount: 4, lastFlagTimestamp: "2026-02-25" },
      },
    });
    await saveSamplingState(state, runtimeDir);
    const loaded = await loadSamplingState(runtimeDir);
    expect(loaded.rates.planner.rate).toBe(0.4);
    expect(loaded.rates.orchestrator.lastFlagTimestamp).toBe("2026-02-25");
    expect(loaded.defaults.decayPerClean).toBe(0.05);
  });
});
