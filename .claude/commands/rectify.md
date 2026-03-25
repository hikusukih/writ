Scan for inconsistencies between the documentation and the actual codebase. Work through each check below, then print a summary report of all findings.

Do NOT create GitHub Issues during this run — just report findings.

---

## Check 1: Docs describing things not in code

Read `docs/architecture/` files. For each component, agent, or system described, verify that corresponding source files exist in `src/`.

Key mappings to check:
- Each agent described in `docs/architecture/agents/` → corresponding file in `src/agents/`
- Each component in `docs/architecture/components/` → corresponding file in `src/`
- Script references in docs → actual scripts in `src/instance/scripts/`
- Registry entries in `src/instance/identity/registry.json` → actual agent implementations

Report: doc references with no corresponding code.

## Check 2: Code implementing things not in docs

List all files in `src/agents/` and `src/instance/scripts/`. Check each against:
- `docs/architecture/` for design documentation
- `CLAUDE.md` Key Source Files section

Report: implemented files with no documentation or roadmap entry.

## Check 3: Stale references and broken internal links

Scan all `.md` files in `docs/` for:
- Links to files that don't exist (both relative paths and anchors)
- References to source files by path that have moved or been deleted
- Cross-references to other docs that have been renamed

Run: `grep -r "\[.*\](.*\.md)" docs/ --include="*.md" -o` and verify each target exists.

## Check 4: OpenQuestions.md items resolved in code

Read `docs/planning/OpenQuestions.md`. For each **Open** item, check whether the described question now has an answer visible in the codebase (implemented code, tests, or a "Decided" annotation added).

Report: open questions where the code suggests a decision has been made but the doc hasn't been updated.

## Check 5: TODO/placeholder content in spec docs

Scan `docs/architecture/` and `docs/planning/` for:
- Sections containing "TBD", "TODO", "placeholder", "PLACEHOLDER", "to be determined", "fill in"
- Empty sections (header with no content)
- Spec stubs that should either be fleshed out or converted to tracked issues

Report each instance with file, section header, and the placeholder text.

## Check 6: CLAUDE.md accuracy

Compare `CLAUDE.md` Key Source Files section against actual `src/` contents:
- Files listed in CLAUDE.md that don't exist
- Files in `src/agents/` not listed in CLAUDE.md
- Wiring diagram in CLAUDE.md vs. actual call graph (check orchestrator.ts, planner.ts, lieutenant-planner.ts imports)

---

## Output format

Print a report with one section per check. For each finding:

```
[CHECK N] <short description>
  File: <path>
  Detail: <what's wrong>
  Suggested action: <fix doc | fix code | create issue | investigate>
```

End with a summary count: X findings across Y checks. Note any checks that were skipped and why.
