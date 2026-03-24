/**
 * Integration Tests — Gist Command Channel
 *
 * Tests the poll and post scripts against the real GitHub Gist API.
 * A live Gist is created at the start of the suite and deleted at the end.
 *
 * Requires WRIT_GITHUB_TOKEN (Gist-scoped PAT) in environment.
 * Skips the entire suite if the token is not set.
 *
 * Run:
 *   npm run test:integration
 *
 * The WRIT_GITHUB_TOKEN must be set in .env or the shell environment.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

// Only use WRIT_GITHUB_TOKEN — this must be a Gist-scoped PAT.
// GH_TOKEN is intentionally excluded: it is typically repo-scoped and lacks Gist permissions.
const GITHUB_TOKEN = process.env.WRIT_GITHUB_TOKEN ?? "";
const GIST_FILENAME = "command.txt";
const PROJECT_ROOT = process.cwd();
const POLL_SCRIPT = join(PROJECT_ROOT, "scripts", "poll-command-from-gist.sh");
const POST_SCRIPT = join(PROJECT_ROOT, "scripts", "post-command-result-to-gist.sh");
const GIST_API = "https://api.github.com/gists";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * GitHub API helper using curl via spawnSync.
 * Node's fetch/https DNS resolution does not work in this dev environment;
 * curl uses the system resolver and does work.
 */
function apiRequest(
  method: string,
  url: string,
  body?: unknown
): { status: number; data: unknown } {
  const args = [
    "-s",
    "-w", "\n%{http_code}",
    "-X", method,
    "-H", `Authorization: token ${GITHUB_TOKEN}`,
    "-H", "Accept: application/vnd.github.v3+json",
    "-H", "Content-Type: application/json",
  ];
  if (body !== undefined) {
    args.push("-d", JSON.stringify(body));
  }
  args.push(url);

  const result = spawnSync("curl", args, { encoding: "utf-8", timeout: 15_000 });
  if (result.error) throw result.error;

  const output = result.stdout ?? "";
  const lines = output.split("\n");
  const statusLine = lines[lines.length - 1].trim();
  const bodyText = lines.slice(0, -1).join("\n").trim();

  const status = parseInt(statusLine, 10);
  const data = bodyText ? JSON.parse(bodyText) : null;
  return { status, data };
}

function createGist(description: string, content: string): string {
  const { status, data } = apiRequest("POST", GIST_API, {
    description,
    public: false,
    files: { [GIST_FILENAME]: { content } },
  });
  if (status !== 201) {
    throw new Error(`Failed to create Gist: HTTP ${status} — ${JSON.stringify(data)}`);
  }
  return (data as { id: string }).id;
}

function getGistContent(gistId: string): string {
  const { status, data } = apiRequest("GET", `${GIST_API}/${gistId}`);
  if (status !== 200) {
    throw new Error(`Failed to fetch Gist: HTTP ${status}`);
  }
  const files = (data as { files: Record<string, { content: string }> }).files;
  const file = files[GIST_FILENAME];
  return file ? file.content : "";
}

function setGistContent(gistId: string, content: string): void {
  const { status } = apiRequest("PATCH", `${GIST_API}/${gistId}`, {
    files: { [GIST_FILENAME]: { content } },
  });
  if (status !== 200) {
    throw new Error(`Failed to update Gist: HTTP ${status}`);
  }
}

function deleteGist(gistId: string): void {
  const { status } = apiRequest("DELETE", `${GIST_API}/${gistId}`);
  if (status !== 204) {
    throw new Error(`Failed to delete Gist: HTTP ${status}`);
  }
}

function runScript(
  script: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  input?: string
): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync("bash", [script, ...args], {
    env: { ...process.env, ...env },
    input,
    encoding: "utf-8",
    timeout: 15_000,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe.skipIf(!GITHUB_TOKEN)("Gist Command Channel", () => {
  let gistId: string;
  let runtimeDir: string;

  beforeAll(async () => {
    if (!GITHUB_TOKEN) return; // describe.skipIf guards tests; this guards the hook

    // Temp runtime dir so tests don't touch the real runtime/
    runtimeDir = await mkdtemp(join(tmpdir(), "writ-gist-test-"));

    // Create a fresh Gist with an initial command payload, named with a UUID
    // to make it clearly identifiable as a test artifact
    const testRunId = randomUUID();
    gistId = createGist(
      `writ-test-${testRunId}`,
      `test command ${testRunId}`
    );
  });

  afterAll(async () => {
    if (!GITHUB_TOKEN) return;
    // Always clean up, even if tests fail
    if (gistId) {
      try { deleteGist(gistId); } catch { /* best-effort — don't mask test failures */ }
    }
    if (runtimeDir) {
      await rm(runtimeDir, { recursive: true, force: true });
    }
  });

  const scriptEnv = () => ({
    WRIT_COMMAND_GIST_ID: gistId,
    WRIT_COMMAND_GIST_FILENAME: GIST_FILENAME,
    WRIT_GITHUB_TOKEN: GITHUB_TOKEN,
    WRIT_RUNTIME_DIR: runtimeDir,
  });

  // -------------------------------------------------------------------------
  // Test 1 — Poll: non-empty Gist → inbox file written, Gist cleared
  // -------------------------------------------------------------------------

  it("poll: non-empty Gist → writes .cmd file to inbox and clears the Gist", async () => {
    // The Gist already has content from beforeAll (the UUID command payload).
    // Capture what it contains so we can assert the inbox file matches.
    const originalContent = getGistContent(gistId);
    expect(originalContent.trim()).not.toBe("");

    const result = runScript(POLL_SCRIPT, [], scriptEnv());

    expect(result.exitCode).toBe(0);

    // A .cmd file should appear in the inbox
    const inboxDir = join(runtimeDir, "inbox");
    const files = await readdir(inboxDir);
    const cmdFiles = files.filter((f) => f.endsWith(".cmd"));
    expect(cmdFiles).toHaveLength(1);

    // The file's content should match what was in the Gist
    const cmdContent = await readFile(join(inboxDir, cmdFiles[0]), "utf-8");
    expect(cmdContent).toBe(originalContent);

    // The Gist should now be empty (poll script overwrites with a single space)
    const gistContentAfter = getGistContent(gistId);
    expect(gistContentAfter.trim()).toBe("");
  });

  // -------------------------------------------------------------------------
  // Test 2 — Poll: empty Gist → no inbox file written
  // -------------------------------------------------------------------------

  it("poll: empty Gist → exits 0, no new .cmd file written", async () => {
    // Gist is already cleared from Test 1
    const inboxDir = join(runtimeDir, "inbox");
    const filesBefore = await readdir(inboxDir);
    const cmdCountBefore = filesBefore.filter((f) => f.endsWith(".cmd")).length;

    const result = runScript(POLL_SCRIPT, [], scriptEnv());

    expect(result.exitCode).toBe(0);
    // No output — silent exit on empty Gist
    expect(result.stdout.trim()).toBe("");
    expect(result.stderr.trim()).toBe("");

    const filesAfter = await readdir(inboxDir);
    const cmdCountAfter = filesAfter.filter((f) => f.endsWith(".cmd")).length;
    expect(cmdCountAfter).toBe(cmdCountBefore); // no new files
  });

  // -------------------------------------------------------------------------
  // Test 3 — Post: appends result to Gist with timestamp separator
  // -------------------------------------------------------------------------

  it("post: appends result content to Gist with timestamp separator", () => {
    const resultText = `task complete ${randomUUID()}`;

    const result = runScript(POST_SCRIPT, [], scriptEnv(), resultText);

    expect(result.exitCode).toBe(0);

    const gistContent = getGistContent(gistId);
    expect(gistContent).toContain(resultText);
    // Timestamp separator format: --- 2026-...Z ---
    expect(gistContent).toMatch(/---\s+\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\s+---/);
  });

  // -------------------------------------------------------------------------
  // Test 4 — Post then poll: posted result is read back, Gist cleared
  // -------------------------------------------------------------------------

  it("post then poll: posted result is picked up by the next poll", async () => {
    // At this point the Gist has the result from Test 3. Poll it.
    const contentBeforePoll = getGistContent(gistId);
    expect(contentBeforePoll.trim()).not.toBe("");

    const inboxDir = join(runtimeDir, "inbox");
    const filesBefore = await readdir(inboxDir);
    const cmdCountBefore = filesBefore.filter((f) => f.endsWith(".cmd")).length;

    const result = runScript(POLL_SCRIPT, [], scriptEnv());
    expect(result.exitCode).toBe(0);

    const filesAfter = await readdir(inboxDir);
    const cmdFiles = filesAfter.filter((f) => f.endsWith(".cmd"));
    expect(cmdFiles).toHaveLength(cmdCountBefore + 1);

    // Gist cleared again
    const gistContentAfter = getGistContent(gistId);
    expect(gistContentAfter.trim()).toBe("");
  });

  // -------------------------------------------------------------------------
  // Test 5 — Poll with bad token → error logged, exits non-zero, Gist untouched
  // -------------------------------------------------------------------------

  it("poll: bad token → exits non-zero, Gist is untouched", async () => {
    // Put a known value into the Gist first
    setGistContent(gistId, "sentinel content should survive bad poll");

    const inboxDir = join(runtimeDir, "inbox");
    const filesBefore = await readdir(inboxDir);
    const cmdCountBefore = filesBefore.filter((f) => f.endsWith(".cmd")).length;

    const result = runScript(POLL_SCRIPT, [], {
      ...scriptEnv(),
      WRIT_GITHUB_TOKEN: "bad_token_intentionally_invalid",
    });

    expect(result.exitCode).not.toBe(0);

    // No new inbox file
    const filesAfter = await readdir(inboxDir);
    expect(filesAfter.filter((f) => f.endsWith(".cmd"))).toHaveLength(cmdCountBefore);

    // Gist content unchanged (we can verify with the real token)
    const gistContent = getGistContent(gistId);
    expect(gistContent.trim()).toBe("sentinel content should survive bad poll");

    // Clean up: clear the sentinel so afterAll delete works cleanly
    setGistContent(gistId, " ");
  });
});
