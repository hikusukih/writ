# Developer/Writer Branch-Based Script Staging

## Summary
Replace the flat `runtime/staging/scripts/` directory with a git branch workflow: each DW session creates a feature branch (keyed by GUID), scripts are committed there, and promotion to live means merging to main and pulling into `src/instance/scripts/`.

## Motivation
The current staging model (write to temp dir → move to live) has no history, no diff visibility, and no rollback beyond filesystem backups. A branch model gives all three via git, and aligns with the Script Branch Workflow backlog item.

## Design Notes
- `runtime/staging/scripts/{GUID}` becomes a branch checkout of `src/instance/scripts/`.
- If script passes review: push to main, pull in real directory, rmdir the GUID checkout, delete branch.
- If review fails: rmdir, delete branch. Clean.
- Requires Gitea (or local git repo at minimum).

## Dependencies
Gitea Integration, Script Branch Workflow.

## Unlocks
Auditable script creation history, rollback capability, PR-based human review of generated scripts.
