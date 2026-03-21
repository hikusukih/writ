import { writeFile, mkdir, copyFile, access } from "node:fs/promises";
import { join, basename } from "node:path";
import { DeveloperWriterRequestSchema, DeveloperWriterResultSchema } from "../schemas.js";
import { callWithValidation } from "./llm-utils.js";
import { buildSystemPrompt } from "./prompt-builder.js";
import { getAgentConfig } from "../identity/loader.js";
import { parseScriptFrontmatter } from "../scripts/index.js";
import { applyReview } from "./reviewed.js";
import { verbose } from "../logger.js";
import type { LLMClient } from "./claude-client.js";
import type { IOAdapter } from "../io/IOAdapter.js";
import type { DeveloperWriterRequest, DeveloperWriterResult, IdentityContext, ScriptInfo } from "../types.js";

/**
 * Generate a shell script from a capability description using an LLM.
 */
export async function generateScript(
  client: LLMClient,
  request: DeveloperWriterRequest,
  identity: IdentityContext
): Promise<DeveloperWriterResult> {
  DeveloperWriterRequestSchema.parse(request);

  const agentConfig = getAgentConfig(identity, "developer-writer");
  const systemPrompt = buildSystemPrompt(agentConfig, identity);

  const existingList = request.existingScripts
    .map((s) => `- ${s.id}: ${s.description}`)
    .join("\n");

  const userMessage = `Generate a shell script for this capability:

${request.capability}

${request.context ? `Context: ${request.context}\n` : ""}Existing scripts (do not duplicate):
${existingList || "(none)"}

Respond with ONLY a JSON object, no fences, no prose:
{"scriptName": "my-script", "scriptContent": "#!/bin/bash\\n# @name my-script\\n...", "testSuggestions": "optional"}`;

  verbose("DeveloperWriter: generating script", { capability: request.capability });

  const result = await callWithValidation(
    client,
    systemPrompt,
    userMessage,
    DeveloperWriterResultSchema,
    { label: "DeveloperWriter", agentId: "developer-writer" }
  );

  // Validate that the generated script has proper frontmatter
  const parsed = parseScriptFrontmatter(result.scriptContent, `${result.scriptName}.sh`, "");
  if (!parsed || !parsed.description) {
    throw new Error(`Generated script "${result.scriptName}" is missing required frontmatter (@name, @description)`);
  }

  verbose("DeveloperWriter: script generated", { name: result.scriptName });
  return result;
}

/**
 * Write a generated script to the staging directory.
 * Returns the staging path.
 */
export async function stageScript(
  content: string,
  scriptName: string
): Promise<string> {
  const stagingDir = join("runtime", "staging", "scripts");
  await mkdir(stagingDir, { recursive: true });
  const stagingPath = join(stagingDir, `${scriptName}.sh`);
  await writeFile(stagingPath, content, { mode: 0o755 });
  verbose("DeveloperWriter: script staged", { stagingPath });
  return stagingPath;
}

/**
 * Promote a staged script to the live scripts directory.
 * Re-parses frontmatter to confirm validity.
 * Throws if a script with the same name already exists.
 */
export async function promoteScript(
  stagingPath: string,
  scriptsDir: string,
  options?: { onPromote?: () => void }
): Promise<ScriptInfo> {
  const filename = basename(stagingPath);
  const destPath = join(scriptsDir, filename);

  // Check for collision
  try {
    await access(destPath);
    throw new Error(`Script "${filename}" already exists in ${scriptsDir}`);
  } catch (err) {
    if (err instanceof Error && err.message.includes("already exists")) throw err;
    // File doesn't exist — good
  }

  await copyFile(stagingPath, destPath);

  // Re-parse frontmatter from the promoted file to confirm validity
  const { readFile } = await import("node:fs/promises");
  const content = await readFile(destPath, "utf-8");
  const info = parseScriptFrontmatter(content, filename, destPath);
  if (!info || !info.description) {
    throw new Error(`Promoted script "${filename}" has invalid frontmatter`);
  }

  // Ensure executable
  const { chmod } = await import("node:fs/promises");
  await chmod(destPath, 0o755);

  verbose("DeveloperWriter: script promoted", { destPath, scriptId: info.id });
  options?.onPromote?.();

  return info;
}

/**
 * Full DW pipeline: generate → review → stage → promote.
 * Returns the promoted ScriptInfo on success.
 * Throws ReviewHaltError if review blocks the script.
 */
export async function generateAndPromote(
  client: LLMClient,
  request: DeveloperWriterRequest,
  identity: IdentityContext,
  scriptsDir: string,
  options?: { adapter?: IOAdapter; onPromote?: () => void }
): Promise<ScriptInfo> {
  const result = await generateScript(client, request, identity);

  // Review the generated script content before staging
  await applyReview(result.scriptContent, identity, {
    client,
    subjectAgentId: "developer-writer",
    adapter: options?.adapter,
  });

  const stagingPath = await stageScript(result.scriptContent, result.scriptName);
  return promoteScript(stagingPath, scriptsDir, { onPromote: options?.onPromote });
}
