Read the planning context that was fetched at session start and summarize it for the conversation.

## 1. Read planning files

Read `~/.writ/planning/issues.json` and `~/.writ/planning/board.json`. If either file is missing or contains an `"error"` key, note it and explain how to fix it (set `GH_TOKEN` in the cloud environment configuration and restart the session).

## 2. Issues summary

From `issues.json`, report:
- Total open issues, count by label group (on-deck, needs-refinement, vaguebooking, backlog, blocked)
- Full list of **on-deck** issues: number, title, labels, one-line body preview
- Full list of **needs-refinement** issues: number, title, labels, one-line body preview
- Any issues labeled **blocked**: number, title

## 3. Board summary

From `board.json`, report:
- Each project board name and its columns
- Card counts per column
- Any cards with notes (print the note text)

If no classic project boards are found, note it and suggest checking GitHub Projects v2 in the web UI.

## 4. Branch status

Run: `git branch --show-current`
Run: `git log --oneline -5`
Run: `git diff --stat origin/main HEAD 2>/dev/null || echo "(no upstream diff available)"`

Report the current branch, last 5 commits, and how many files differ from main.

## 5. Ready summary

Print a short "Ready" section listing:
- What branch we're on
- How many on-deck issues are available to work
- What to run next (`/generate-tasks #N` to pick up an issue, or `/change-directive` to draft a change)
