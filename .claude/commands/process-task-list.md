Work through the current TodoWrite task list one task at a time.

## 1. Find the current task

Read the TodoWrite task list. Identify the first task that is `in_progress`, or if none, the first `pending` task. If all tasks are `done`, print "All tasks complete." and stop.

## 2. Announce the task

Print the task description and its position in the list (e.g. "**Task 3 of 7:** …"). If it is a research/read task, list the files you are about to read.

## 3. Execute the task

Work the task to completion:

- **Research / read tasks** — read the listed files, then summarize what is relevant to the change. Do not write code yet.
- **Schema / types tasks** — add or update types in `src/types.ts` / `src/schemas.ts`. Run `npm run build` to confirm no type errors.
- **Core implementation tasks** — write or modify the source files specified. Follow the patterns in CLAUDE.md. Run `npm run build` after each file.
- **Unit test tasks** — write `*.test.ts` alongside the new module. Run `npm test` and confirm the new tests pass.
- **Integration test tasks** — add or extend `src/integration/pipeline.integration.test.ts`. Run `npm run test:integration` and confirm the new cases pass.
- **Docs update tasks** — update `CLAUDE.md` and any architecture docs that are now out of date.
- **Commit and push tasks** — stage the relevant files, write a clear commit message, commit, and push to the current branch.

## 4. Mark done and continue

When the task is complete, mark it `done` in TodoWrite. Then immediately move to the next pending task (return to step 1) without waiting for the user, unless:

- The task produced output the user should review before continuing (e.g. a draft Change Directive, a test failure, a destructive file operation).
- The task was "Commit and push" — always pause after pushing so the user can confirm before continuing.
- You hit a blocker that requires user input.

In those cases, pause and describe what happened or what decision is needed.

## 5. Finish

When all tasks are marked `done`, print a brief summary of what was completed and any follow-up actions (open PRs, issues to close, manual steps, etc.).
