Draft a Change Directive for the issue or feature being worked on.

A Change Directive is a concise, structured description of a single change: what to build, why, how to verify it, and what the acceptance criteria are. It serves as the shared contract between planning and implementation.

## 1. Identify the target

If an issue number was passed as an argument (e.g. `/change-directive 41`), fetch that issue:

```bash
curl -sf -H "Authorization: token $GH_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/hikusukih/writ/issues/$ARGS" 2>/dev/null
```

If no argument was given, read `~/.writ/planning/issues.json` and list the on-deck issues, then ask the user which one to target.

If `GH_TOKEN` is unset, work from what's in `~/.writ/planning/issues.json` or ask the user to describe the change.

## 2. Read relevant context

- Read `CLAUDE.md` for current architecture and key source files
- Read any architecture docs in `docs/architecture/` relevant to the feature area

## 3. Draft the Change Directive

Output a Change Directive in this format:

---

# Change Directive: [short title]

**Issue:** #N — [title]
**Branch:** [suggested branch name, e.g. `feat/short-description`]
## What

[2–4 sentences describing the change. What is being built or modified? What is the user-visible or system-visible outcome?]

## Why

[1–3 sentences: what problem does this solve, or what capability does it unlock? Reference the issue motivation if present.]

## Scope

**In scope:**
- [bullet list of what will be changed/added]

**Out of scope:**
- [explicit exclusions to prevent scope creep]

## Key files

[List the source files most likely to be touched, based on CLAUDE.md and the architecture docs.]

## Acceptance criteria

- [ ] [Specific, testable criterion]
- [ ] [Integration test passes (describe what it validates)]
- [ ] [CLAUDE.md updated if new source files added]

## Open questions

[Any ambiguities that need resolution before or during implementation. If none, write "None."]

---

After printing the directive, ask: "Does this look right? Should I proceed with `/generate-tasks` to break this into implementation steps?"
