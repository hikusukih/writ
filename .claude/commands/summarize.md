Produce a development summary covering the current state of this repository. Work through each section below and output the results as clean markdown suitable for pasting into a planning conversation.

## 1. PRs merged since last summary

Run: `git log --oneline --merges origin/main --since="30 days ago"`

List each merged PR on one line: PR number (if visible in commit message), title, date.

## 2. Open branches / in-progress work

Run: `git branch -r | grep -v HEAD | grep -v origin/main`

List each branch. For branches starting with `claude/`, note the task description encoded in the name.

## 3. Current GitHub Issues by label

Run: `gh issue list --label "on-deck"`, `gh issue list --label "needs-refinement"`, `gh issue list --label "blocked"`

Group results under each label. If `gh` is not authenticated, note that issue tracking is unavailable and skip this section.

## 4. Test suite status

Run unit tests: `npm test`
Run integration tests: `npm run test:integration`

Report: total tests, passed, failed, skipped for each suite. If tests fail, list the failing test names.

## 5. Notable recent changes to architecture docs or key files

Run: `git diff --name-only origin/main HEAD` and `git log --oneline -20 --name-only`

Highlight any changes to: `CLAUDE.md`, `docs/architecture/`, `docs/planning/Roadmap.md`, `src/agents/`, `src/types.ts`, `src/schemas.ts`.

## 6. TODOs and open questions in code

Run: `grep -r "TODO\|FIXME\|HACK\|XXX" src/ --include="*.ts" -n`

List findings grouped by file. Skip noise — focus on actionable items.

---

Format the output as scannable markdown sections. Be concise. No fluff.
