# OpenClaw Design Lineage and Rationale

Writ is a security-first redesign of [OpenClaw](https://github.com/openclaw/openclaw) (a locally-deployed multi-agent system that allows an LLM to call out to shell scripts and modify itself). OpenClaw is the conceptual ancestor; Writ addresses its structural security weaknesses while preserving what's valuable.

## What Writ Inherits from OpenClaw

**Self-improvement via file mutation**: OpenClaw's core insight — that an agent system can extend itself by generating and running scripts — is the foundation Writ builds on. The Developer/Writer → staging → promotion pipeline is Writ's structured, reviewed version of this pattern.

**Script-as-capability model**: OpenClaw surfaces capabilities as shell scripts with structured frontmatter. Writ keeps this (see `src/instance/scripts/`, `@name`/`@description`/`@param` headers) and adds discovery, validation, and review gating.

**Local deployment by default**: OpenClaw is designed to run locally, not as a cloud service. Writ inherits this assumption — the system owns a local filesystem and shell, and agents operate within that context.

**SOUL.md / personality bootstrapping**: OpenClaw uses a dialogue to establish personality during first run. Writ keeps this approach (see `docs/architecture/AgentIdentityAndState.md`) and extends it with CONSTITUTION.md for hard ethical boundaries.

## What Writ Rejects or Redesigns

**Unrestricted shell access**: OpenClaw allows agents to run arbitrary shell commands without review. Writ gates all execution through the Compiler, which validates instruction JSON and runs scripts in a controlled way. Agents cannot directly invoke shell commands — they emit plans, which the Compiler executes.

**No audit trail**: OpenClaw has no append-only log. Writ logs every agent invocation, review decision, and script execution to `runtime/logs/agent.jsonl` and `runtime/logs/review-decisions.jsonl`.

**No review chain**: OpenClaw has no mechanism to catch hallucinated or dangerous outputs before they reach execution. Writ adds LLM-backed review (`reviewWithLLM()`) at multiple pipeline stages and supports rule-based fallback review.

**Unbounded self-modification**: OpenClaw allows agents to rewrite any file. Writ restricts self-modification to identity files (`src/instance/identity/`), enforces atomic writes with backups, and caps self-modification rounds (3-round limit in BIG_BROTHER).

**No separation of concerns between agent types**: OpenClaw doesn't distinguish between orchestration, planning, execution, and review. Writ formalizes these as distinct agent roles with separate identities and permissions (see `src/instance/identity/registry.json`).

## Design Decisions Driven by OpenClaw Failure Modes

| OpenClaw failure mode | Writ design response |
|---|---|
| Agent overwrites critical files | Identity writer uses atomic `.pending` → rename; backups to `runtime/config-backups/` |
| Agents run harmful scripts | Compiler validates instruction JSON; reviewer rejects harmful plans |
| No record of what happened | Append-only JSONL audit trail in `runtime/logs/` |
| Agents loop on bad state | 3-round self-modification cap; sampling rate decay |
| No user control over autonomy | FAFC review decisions route through Human-Judgment Agent |

## Further Reading

- `docs/architecture/Overview.md` — Current Writ architecture
- `docs/architecture/AgentIdentityAndState.md` — Identity and SOUL.md bootstrapping
- `docs/architecture/SecurityModel.md` — Security boundaries and threat model
