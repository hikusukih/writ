Produce a development summary covering the current state of this repository. Work through each section below and output the results as clean markdown suitable for pasting into a planning conversation.

## 1. PRs merged since last summary

Run: `git log --oneline --merges origin/main --since="30 days ago"`

List each merged PR on one line: PR number (if visible in commit message), title, date.

## 2. Open branches / in-progress work

Run: `git branch -r | grep -v HEAD | grep -v origin/main`

List each branch. For branches starting with `claude/`, note the task description encoded in the name.

## 3. Current GitHub Issues by label

The `gh` CLI does not work in this environment because the git remote points to a local proxy. Use the GitHub API directly with `GH_TOKEN`:

```bash
curl -s -H "Authorization: token $GH_TOKEN" -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/hikusukih/writ/issues?state=open&labels=on-deck&per_page=50"
curl -s -H "Authorization: token $GH_TOKEN" -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/hikusukih/writ/issues?state=open&labels=needs-refinement&per_page=50"
curl -s -H "Authorization: token $GH_TOKEN" -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/hikusukih/writ/issues?state=open&labels=blocked&per_page=50"
```

Parse each response for `number`, `title`, and `html_url`. Group results under each label. If `GH_TOKEN` is unset, note that issue tracking is unavailable and skip this section.

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
