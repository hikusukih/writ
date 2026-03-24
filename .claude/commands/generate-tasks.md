Generate a detailed implementation task list for the current change directive or a specified issue.

Usage: `/generate-tasks` (uses current context) or `/generate-tasks #N` (fetches issue N)

## 1. Load the target

If an issue number is provided as an argument, fetch it from GitHub:

```bash
curl -sf -H "Authorization: token $GH_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/hikusukih/writ/issues/$ARGS" 2>/dev/null
```

If no argument, check the conversation for a recently drafted Change Directive. If neither is available, ask the user to provide the issue number or description.

## 2. Read architecture context

Read these files to understand current wiring and patterns before generating tasks:
- `CLAUDE.md` (Key Source Files, Code Patterns, Integration Test Requirements)
- Relevant files in `src/` based on the feature area
- `docs/planning/Roadmap.md` to understand phase context

## 3. Generate the task list

Break the change into concrete implementation steps. Use the TodoWrite tool to create the task list.

Task list structure:
1. **Research / read** — files to read before writing code
2. **Schema / types** — any new types in `src/types.ts` or `src/schemas.ts`
3. **Core implementation** — main source files to create or modify, in dependency order
4. **Unit tests** — `*.test.ts` files alongside each new module
5. **Integration test** — add or extend `src/integration/pipeline.integration.test.ts` (required per CLAUDE.md)
6. **Docs updates** — CLAUDE.md, Roadmap.md, architecture docs if needed
7. **Commit and push** — final step

Rules for tasks:
- Each task should be completable in a single focused session
- Tasks that touch the review chain need both a "happy path" and a "deny/halt" integration test case
- Do NOT mark the parent feature complete until the integration test passes (`npm run test:integration`)
- CLAUDE.md must accurately reflect any new source files before the final commit

After creating the task list with TodoWrite, print a summary of the tasks so the user can review them. Then ask: "Ready to start? Run `/process-task-list` to work through these one by one, or tell me which task to start with."
