Generate implementation sub-issues for a GitHub issue, breaking it into concrete steps the implementation environment can execute one at a time.

Usage: `/generate-tasks #N`

## 1. Load the target issue

Fetch issue #N using `mcp__github__issue_read` for repo `hikusukih/writ`.

If the issue body is missing or too vague to decompose, print:
"Issue #N needs more detail before tasks can be generated. Refine the body first (What / Why / Scope / Acceptance criteria)."
Then stop.

## 2. Read architecture context

Read `CLAUDE.md` (Key Source Files, Code Patterns, Integration Test Requirements) and any `docs/architecture/` files relevant to the feature area. Use this to identify which source files will be touched and what patterns apply.

## 3. Generate implementation steps

Break the change into ordered sub-issues using these categories (skip categories that don't apply):

1. **Research** — files to read and understand before writing code
2. **Types/schema** — new or changed types in `src/types.ts` / `src/schemas.ts`
3. **Core implementation** — source files to create or modify, in dependency order
4. **Unit tests** — `*.test.ts` files alongside each new module
5. **Integration test** — add or extend `src/integration/pipeline.integration.test.ts`
6. **Docs** — CLAUDE.md and architecture docs, if new source files or wiring changes

Rules:
- Each sub-issue should be completable in a single focused implementation session
- Features that touch the review chain need both a happy-path and a deny/halt integration test case
- The integration test sub-issue is required (per CLAUDE.md) — never skip it

## 4. Create the sub-issues

For each step, use `mcp__github__sub_issue_write` to create a sub-issue on issue #N in repo `hikusukih/writ`.

Sub-issue title: short verb phrase (e.g. "Add `FooBar` type to src/types.ts")
Sub-issue body: 2–4 sentences — what to do, what files to touch, and what "done" looks like (including how to verify: build passes, test passes, etc.).

Create them in order. After all are created, print a summary list of the sub-issue numbers and titles.
