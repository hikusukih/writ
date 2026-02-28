import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compile, CompilerError } from "./compiler.js";
import type { InstructionFile } from "../types.js";

describe("compile", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), "writ-compiler-"));

    await writeFile(
      join(testDir, "echo-msg.sh"),
      [
        "#!/bin/bash",
        "# @name echo-msg",
        "# @description Echo a message",
        "# @param MSG The message",
        'echo "$MSG"',
      ].join("\n"),
      { mode: 0o755 }
    );

    await writeFile(
      join(testDir, "greet.sh"),
      [
        "#!/bin/bash",
        "# @name greet",
        "# @description Greet someone",
        "# @param NAME Who to greet",
        "# @param GREETING The greeting (optional)",
        'echo "${GREETING:-Hello} $NAME"',
      ].join("\n"),
      { mode: 0o755 }
    );
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true });
  });

  it("executes valid instructions and returns results", async () => {
    const instructions: InstructionFile = {
      planId: "test-plan",
      steps: [{ scriptId: "echo-msg", params: { MSG: "hello compiler" }, order: 0 }],
    };
    const results = await compile(instructions, testDir);
    expect(results).toHaveLength(1);
    expect(results[0].stdout).toBe("hello compiler");
    expect(results[0].exitCode).toBe(0);
  });

  it("executes steps in order", async () => {
    const instructions: InstructionFile = {
      planId: "test-plan",
      steps: [
        { scriptId: "echo-msg", params: { MSG: "second" }, order: 1 },
        { scriptId: "echo-msg", params: { MSG: "first" }, order: 0 },
      ],
    };
    const results = await compile(instructions, testDir);
    expect(results[0].stdout).toBe("first");
    expect(results[1].stdout).toBe("second");
  });

  it("throws CompilerError with script-not-found for unknown scriptId", async () => {
    const instructions: InstructionFile = {
      planId: "test-plan",
      steps: [{ scriptId: "nonexistent", params: {}, order: 0 }],
    };
    await expect(compile(instructions, testDir)).rejects.toThrow(CompilerError);
    await expect(compile(instructions, testDir)).rejects.toMatchObject({
      issue: "script-not-found",
      scriptId: "nonexistent",
      stepOrder: 0,
    });
  });

  it("throws CompilerError with undeclared-param for param not in frontmatter", async () => {
    const instructions: InstructionFile = {
      planId: "test-plan",
      steps: [{ scriptId: "echo-msg", params: { MSG: "hi", INJECTED: "bad" }, order: 0 }],
    };
    await expect(compile(instructions, testDir)).rejects.toThrow(CompilerError);
    await expect(compile(instructions, testDir)).rejects.toMatchObject({
      issue: "undeclared-param",
      scriptId: "echo-msg",
    });
  });

  it("throws ZodError for malformed instruction file", async () => {
    const bad = { planId: 123, steps: "not-an-array" } as unknown;
    await expect(compile(bad as InstructionFile, testDir)).rejects.toThrow();
  });

  it("allows missing declared params (script may have defaults)", async () => {
    const instructions: InstructionFile = {
      planId: "test-plan",
      steps: [{ scriptId: "greet", params: { NAME: "World" }, order: 0 }],
    };
    const results = await compile(instructions, testDir);
    expect(results[0].stdout).toBe("Hello World");
    expect(results[0].exitCode).toBe(0);
  });
});
