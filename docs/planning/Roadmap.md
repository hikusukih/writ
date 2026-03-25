# Writ Implementation Roadmap

### Key Files
See `CLAUDE.md` for the full source file map.

---

## Component Status

| Component | Status |
|---|---|
| Orchestrator, General *Planner*, Executor | Built |
| PLAN-{id}.md + instruction JSON | Built |
| Script Runner + bootstrap scripts | Built |
| [*Script Index*](../dictionary.md) (frontmatter discovery) | Built |
| SOUL.md, CONSTITUTION.md, registry.json | Built |
| XYZ-AGENT.md per-agent config files | Built |
| Rule-Based [*Reviewer*](../dictionary.md) (`reviewer.ts`) | Built |
| `withReview()` HOF + `applyReview()` (`reviewed.ts`) | Built |
| LLM *Reviewer* (`llm-reviewer.ts`) | Built |
| Session persistence (`runtime/sessions/current.json`) | Built |
| [*Compiler*](../dictionary.md) (deterministic: validates JSON, composes + runs scripts) | Built |
| XYZ-REVIEWER-AGENT.md per-agent reviewer configs | Built |
| IOAdapter + CLIAdapter (`src/io/`) | Built |
| Human-Judgment Agent (HJA) | Built |
| Anti-patterns lists + loader + append utility | Built |
| FAFC review decision + ReviewOptions refactor | Built |
| `callWithValidation()` LLM utility | Built |
| Boundary validation (compile/executor Zod parse) | Built |
| Developer / *Writer* ([*DW*](../dictionary.md)) | Built |
| Lieutenant *Planner* + GP → LP → Executor pipeline | Built |
| Review decision logging | Built |
| [*Reviewer-Reviewer*](../dictionary.md) | Built |
| [*BIG_BROTHER*](../dictionary.md) + BIG_BROTHER_REVIEWER | Built |
| Review Sampling Rate | Built |
| Identity Writer (atomic config writes + backups) | Built |
| Pre-Execution Semantic Review (stubbed gate) | Built |
| Integration Test Harness (`TestAdapter`, `MockLLMClient`) | Built |
| Job Graph & Scheduler | Built |

---

## Upcoming Work

### Tier 4 — Async + Initiatives

- **User Statement Log** — [#1](https://github.com/hikusukih/writ/issues/1)
- **Initiative Table & Persistence** — [#2](https://github.com/hikusukih/writ/issues/2)
- **Initiative system / InitiativeBuilder** — [#46](https://github.com/hikusukih/writ/issues/46)

### Tier 5 — Infrastructure + Deployment

- **Gist-based command channel** *(In progress)* — [#47](https://github.com/hikusukih/writ/issues/47) (sub-issues: [#33](https://github.com/hikusukih/writ/issues/33), [#35](https://github.com/hikusukih/writ/issues/35), [#36](https://github.com/hikusukih/writ/issues/36))
- **Containerization** — [#4](https://github.com/hikusukih/writ/issues/4)
- **Adjutant** — [#48](https://github.com/hikusukih/writ/issues/48)
- **Gitea Integration** — [#5](https://github.com/hikusukih/writ/issues/5)
- **Script Branch Workflow** — [#6](https://github.com/hikusukih/writ/issues/6)

*Note: Adjutant's core (OS-class agent + AgentMD + system-class initiatives) does not require containerization. It lives in Tier 5 because tasks that interact with container-local services compose naturally here — but it could be built immediately after the Initiative system if prioritized.*

### Tier 6 — Quality of Life

- **Get-to-know-the-user** — [#49](https://github.com/hikusukih/writ/issues/49)
- **Prompt evolution** — [#50](https://github.com/hikusukih/writ/issues/50)
- **Model management** — [#51](https://github.com/hikusukih/writ/issues/51)
- **System health assessment** — [#52](https://github.com/hikusukih/writ/issues/52)
- **Web Dashboard** — [#7](https://github.com/hikusukih/writ/issues/7)

### Tier 7 — Speculative

- **ClawdBot Integration & Untrusted Execution** — [#8](https://github.com/hikusukih/writ/issues/8)
- **DW Branch Staging** — [#37](https://github.com/hikusukih/writ/issues/37)
- **Scenario CI** — [#11](https://github.com/hikusukih/writ/issues/11)
- **Multi-source input** — [#41](https://github.com/hikusukih/writ/issues/41)

---

### Sequencing Notes

- Items within a tier may be parallelized where there's no intra-tier dependency.
- Tiers should not be skipped — each tier de-risks the next.
- **Two-Loop / Async Architecture** is absorbed by IOAdapter + Job Graph & Scheduler. No standalone implementation needed.
- Tier 4 is the architectural transition point: the linear GP → LP → Executor pipeline is replaced by job-based dispatch. After Tier 4, all execution routes through the Job Graph.
- Tier 5 and Tier 6 have no strict ordering between them — they can be interleaved based on priority.
