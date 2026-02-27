import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runScript } from "./runner.js";
import { listScripts } from "./index.js";

describe("runScript", () => {
  let testDir: string;
  let scriptPath: string;

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), "domesticlaw-scripts-"));
    scriptPath = join(testDir, "test.sh");
    await writeFile(scriptPath, '#!/bin/bash\necho "hello $NAME"', {
      mode: 0o755,
    });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true });
  });

  it("executes a script and captures stdout", async () => {
    const result = await runScript(scriptPath, { NAME: "world" });
    expect(result.stdout).toBe("hello world");
    expect(result.exitCode).toBe(0);
  });

  it("passes params as env vars", async () => {
    const result = await runScript(scriptPath, { NAME: "DomestiClaw" });
    expect(result.stdout).toBe("hello DomestiClaw");
  });

  it("captures stderr", async () => {
    const errScript = join(testDir, "err.sh");
    await writeFile(errScript, '#!/bin/bash\necho "error!" >&2\nexit 1', {
      mode: 0o755,
    });
    const result = await runScript(errScript, {});
    expect(result.stderr).toBe("error!");
    expect(result.exitCode).toBe(1);
  });

  it("times out on long-running scripts", async () => {
    const slowScript = join(testDir, "slow.sh");
    await writeFile(slowScript, "#!/bin/bash\nsleep 10", { mode: 0o755 });
    await expect(
      runScript(slowScript, {}, { timeoutMs: 100 })
    ).rejects.toThrow("timed out");
  });
});

describe("listScripts", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), "domesticlaw-index-"));
    await writeFile(
      join(testDir, "greet.sh"),
      [
        "#!/bin/bash",
        "# @name greet",
        "# @description Say hello",
        "# @param NAME Who to greet",
        'echo "Hello $NAME"',
      ].join("\n"),
      { mode: 0o755 }
    );
    await writeFile(join(testDir, "not-a-script.txt"), "ignore me");
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true });
  });

  it("lists only .sh files", async () => {
    const scripts = await listScripts(testDir);
    expect(scripts).toHaveLength(1);
    expect(scripts[0].id).toBe("greet");
  });

  it("parses frontmatter correctly", async () => {
    const scripts = await listScripts(testDir);
    expect(scripts[0].name).toBe("greet");
    expect(scripts[0].description).toBe("Say hello");
    expect(scripts[0].params).toEqual(["NAME Who to greet"]);
  });
});

