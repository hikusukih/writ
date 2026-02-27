# Claude Code Scratchpad

Notes from Claude Code to Mike during long-running sessions. Cleared each review cycle.

<!-- Cleared 2026-02-26 — findings absorbed into Change Directive 2026-02-26 -->

---

## Fold-In Summary — 2026-02-26

### What Was Applied

**Source**: Change Directive 2026-02-26 (archived to `export/archive/2026-02-26-01-fold-in.md`)

1. **JobGraph.md** — Architecture spec already existed (staged in git). Linked from Overview.md architecture doc index and Roadmap.md Tier 4.

2. **OpenQuestions.md** — Two changes:
   - §"Adjutant Status vs. GP/LP Split" moved from Open to Decided with 7-point resolution (shared infrastructure, owner_class, sudo-like mediation for system initiatives)
   - New §"Job Graph & Scheduler" added with 4 open items (store format, scheduler lifecycle, partial delivery, job expiry)

3. **backlog-initiative-table.md** — Added `owner_class: "user" | "system"` to Initiative schema + new "Owner Class" subsection explaining system-class initiative governance.

4. **Overview.md** — Three changes:
   - Adjutant entry in Agent Classes annotated with shared infrastructure + JobGraph.md link
   - JobGraph.md added to Supporting Specs index
   - Agent-runner decided bullet annotated with Job Graph replacement note
   - Worked example updated: `createPlan()` → `createStrategicPlan()`, Plan schema → StrategicPlan schema

5. **AgentInvocationModel.md** — Two changes:
   - Agent-runner note added as blockquote before the Chosen Approach section (preserving original text per directive)
   - Mermaid diagram: General Planner label updated from `createPlan()` to `createStrategicPlan()`

6. **PlannerInterface.md** — Two changes:
   - Fast-path section struck through and replaced with removal note + OpenQuestions.md reference
   - GP function description updated from `createPlan()` to `createStrategicPlan()` with legacy supersession note linking to OpenQuestions.md §"Legacy createPlan() Cleanup"

7. **ReviewInterface.md** — `request-modifications` decision annotated as "returned but not acted on" with Roadmap.md cross-reference.

8. **Adjutant.md** — Added system-class Initiative responsibility + new "Shared Infrastructure" section with cross-references to JobGraph.md, OpenQuestions.md §"Adjutant Status vs. GP/LP Split", and §6b.

9. **backlog.md** — Item 11 added: Scenario CI via Claude Code Web (`backlog-scenario-ci.md`). File already existed (staged in git).

10. **Roadmap.md** — Tier 4 item (11) updated: replaced `backlog-async-jobs.md` reference with `JobGraph.md` architecture spec link.

11. **Working files**: fold-me-in.md archived and reset to stub. ClaudeScratchpad.md cleared. later-review.md Items section reset.

### Cross-Document Consistency Review Findings

**No new HIGH issues.** All HIGH items from the 2026-02-25 review were addressed by this directive.

**Additional fixes applied during review** (not in directive):
- Overview.md worked example updated from `createPlan()` to `createStrategicPlan()` and StrategicPlan schema
- AgentInvocationModel.md Mermaid diagram label updated from `createPlan()` to `createStrategicPlan()`

**Known acceptable state:**
- AgentInvocationModel.md retains the full agent-runner section below the annotation — this is by design ("annotate, don't delete") per the directive. The section provides design lineage.
- `request-modifications` remains a returned-but-unacted-on decision — tracked in Roadmap.md Technical Debt.

**No contradictions, stale references, or missing cross-references detected** across the full docs/architecture/ and docs/planning/ trees.
