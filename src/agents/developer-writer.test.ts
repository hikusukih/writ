import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateScript, stageScript, promoteScript, generateAndPromote } from "./developer-writer.js";
import type { LLMClient } from "./claude-client.js";
import type { IdentityContext, ScriptInfo } from "../types.js";

const VALID_SCRIPT_CONTENT = `#!/bin/bash
# @name hello-world
# @description Print a greeting message
# @param MESSAGE The message to print
echo "\${MESSAGE:-Hello, world!}"
`;

const mockIdentity: IdentityContext = {
  soul: "# Soul\nBe helpful.",
  constitution: "# Constitution\nBe honest.",
  agents: [
    {
      id: "developer-writer",
      name: "Developer/Writer",
      class: "action",
      configFile: "developer-writer-agent.md",
      agentMd: "# Developer/Writer\nYou write shell scripts.",
      permissions: { canRead: [], canWrite: ["runtime/staging/scripts/"] },
    },
  ],
};

const existingScripts: ScriptInfo[] = [
  {
    id: "list-files",
    name: "list-files",
    description: "List files in a directory",
    params: ["TARGET_DIR The directory to list"],
    path: "/scripts/list-files.sh",
  },
];

function createMockClient(resultJson: object): LLMClient {
  const response = {
    content: JSON.stringify(resultJson),
    inputTokens: 100,
    outputTokens: 50,
  };
  return {
    async sendMessage() { return response; },
    async sendMessages() { return response; },
  };
}

describe("generateScript", () => {
  it("parses a valid LLM response into DeveloperWriterResult", async () => {
    const client = createMockClient({
      scriptName: "hello-world",
      scriptContent: VALID_SCRIPT_CONTENT,
      testSuggestions: "Run with MESSAGE=hi",
    });

    const result = await generateScript(client, {
      capability: "Print a greeting message",
      existingScripts,
    }, mockIdentity);

    expect(result.scriptName).toBe("hello-world");
    expect(result.scriptContent).toContain("@name hello-world");
    expect(result.testSuggestions).toBe("Run with MESSAGE=hi");
  });

  it("throws if the generated script is missing @description frontmatter", async () => {
    const client = createMockClient({
      scriptName: "bad-script",
      scriptContent: "#!/bin/bash\n# @name bad-script\necho hi",
    });

    await expect(
      generateScript(client, { capability: "do something", existingScripts }, mockIdentity)
    ).rejects.toThrow(/missing required frontmatter/);
  });

  it("includes existing scripts in the prompt to prevent duplication", async () => {
    let capturedUser = "";
    const client: LLMClient = {
      async sendMessage(_system, user) {
        capturedUser = user;
        return {
          content: JSON.stringify({
            scriptName: "hello-world",
            scriptContent: VALID_SCRIPT_CONTENT,
          }),
          inputTokens: 100,
          outputTokens: 50,
        };
      },
      async sendMessages() {
        return { content: "{}", inputTokens: 0, outputTokens: 0 };
      },
    };

    await generateScript(client, { capability: "greet user", existingScripts }, mockIdentity);
    expect(capturedUser).toContain("list-files");
    expect(capturedUser).toContain("List files in a directory");
  });
});

describe("stageScript", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), "dw-stage-"));
    // Override staging dir by changing cwd — stageScript uses relative path
    process.chdir(testDir);
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("writes script to runtime/staging/scripts/ and returns path", async () => {
    const stagingPath = await stageScript(VALID_SCRIPT_CONTENT, "hello-world");
    expect(stagingPath).toContain("hello-world.sh");

    const content = await readFile(stagingPath, "utf-8");
    expect(content).toBe(VALID_SCRIPT_CONTENT);
  });

  it("creates the staging directory if it does not exist", async () => {
    const stagingPath = await stageScript(VALID_SCRIPT_CONTENT, "another-script");
    expect(stagingPath).toContain("another-script.sh");
  });
});

describe("promoteScript", () => {
  let testDir: string;
  let stagingDir: string;
  let scriptsDir: string;

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), "dw-promote-"));
    stagingDir = join(testDir, "staging");
    scriptsDir = join(testDir, "scripts");
    await mkdir(stagingDir, { recursive: true });
    await mkdir(scriptsDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("copies script to live directory and returns ScriptInfo", async () => {
    const stagingPath = join(stagingDir, "hello-world.sh");
    await writeFile(stagingPath, VALID_SCRIPT_CONTENT, { mode: 0o755 });

    const info = await promoteScript(stagingPath, scriptsDir);
    expect(info.id).toBe("hello-world");
    expect(info.description).toBe("Print a greeting message");
    expect(info.params).toContain("MESSAGE The message to print");
  });

  it("calls onPromote callback after promotion", async () => {
    const stagingPath = join(stagingDir, "callback-test.sh");
    await writeFile(stagingPath, `#!/bin/bash\n# @name callback-test\n# @description Callback test\necho hi\n`, { mode: 0o755 });

    const onPromote = vi.fn();
    await promoteScript(stagingPath, scriptsDir, { onPromote });
    expect(onPromote).toHaveBeenCalledOnce();
  });

  it("throws on name collision", async () => {
    const stagingPath = join(stagingDir, "hello-world.sh");
    await writeFile(stagingPath, VALID_SCRIPT_CONTENT, { mode: 0o755 });

    await expect(promoteScript(stagingPath, scriptsDir)).rejects.toThrow(/already exists/);
  });
});

describe("generateAndPromote (review integration)", () => {
  let testDir: string;
  let scriptsDir: string;

  beforeAll(async () => {
    testDir = await mkdtemp(join(tmpdir(), "dw-full-"));
    scriptsDir = join(testDir, "scripts");
    await mkdir(scriptsDir, { recursive: true });
    // stageScript uses relative path
    process.chdir(testDir);
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("generates, reviews (allow), and promotes a valid script", async () => {
    const client = createMockClient({
      scriptName: "full-pipeline",
      scriptContent: `#!/bin/bash\n# @name full-pipeline\n# @description End-to-end test script\necho done\n`,
    });

    const info = await generateAndPromote(
      client,
      { capability: "End-to-end test", existingScripts: [] },
      mockIdentity,
      scriptsDir,
      { adapter: undefined }
    );

    expect(info.id).toBe("full-pipeline");
    expect(info.description).toBe("End-to-end test script");
  });
});
