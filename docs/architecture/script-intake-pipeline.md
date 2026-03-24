# Script Intake Pipeline

> This document describes the intended design for ingesting externally-authored scripts into Writ's approved script library. For implementation status, see `docs/planning/Roadmap.md`.

## Motivation

Writ's [*Developer/Writer*](../../dictionary.md) agent generates scripts that are reviewed at authoring time and promoted to `src/instance/scripts/` through an established pipeline. That pipeline assumes the script author is the system itself — a controlled, reviewable provenance chain.

Third-party scripts (downloaded, user-provided, community library) break this assumption. Their provenance is unknown. Their declared intent (frontmatter) may not match their actual behavior. They may contain adversarial content designed to manipulate an LLM reviewer into approval.

OpenClaw's trust-by-default posture toward its script library is a known vulnerability: a malicious or misconfigured script can enter the library and be executed without independent behavioral analysis. Writ's intake pipeline is the structural fix for this class of risk.

## The Information Barrier Principle

The core insight is that LLM evaluation is susceptible to **anchoring**: if the model is shown a script's `@name`, `@description`, or `@param` headers before analyzing its behavior, it will interpret the code through that lens. An adversarial script can exploit this by providing plausible-sounding documentation that leads the reviewer to overlook what the code actually does.

The intake pipeline enforces a strict information barrier:

- **Behavioral analysis** receives ONLY stripped code — no comments, no frontmatter, no filename, no documentation of any kind.
- **Alignment check** is a separate LLM call that receives the independent analysis AND the declared metadata, and compares them.

This separation means the behavioral analysis cannot be biased by the script's self-description. The alignment check is explicitly about detecting discrepancies between what the script claims and what it does.

This is not a sampling decision or a FAFC judgment call — it is a structural property of the pipeline. The two calls must remain separate; collapsing them would defeat the purpose.

## Pipeline Flow

```
External script received
        │
        ▼
[1] Quarantine
    Drop into runtime/staging/intake/
    No execution, no promotion yet
        │
        ▼
[2] Comment stripping (deterministic)
    Regex/parser removes # comment lines
    Produces "bare" version for analysis
    MUST NOT use LLM — intake gate cannot be confused by adversarial input
        │
        ▼
[3] Behavioral analysis (LLM — blind)
    Input: stripped code ONLY
    No comments, no frontmatter, no filename
    LLM independently describes: commands executed, network calls,
    file access, data flow, side effects
        │
        ▼
[4] Alignment check (LLM — informed)
    Input: behavioral analysis from step 3 + declared frontmatter
    LLM compares claimed behavior vs. actual behavior
    Flags discrepancies
        │
        ▼
[5] Constitutional review
    Standard applyReview() pass
    Input: behavioral analysis (not the script itself)
    Is the script's actual behavior consistent with CONSTITUTION.md?
        │
        ▼
[6] Human judgment gate (mandatory — not FAFC-optional)
    Present summary:
    - Degree of match between declared and actual behavior
    - All effects: file creation/deletion/modification, data exposure
    - All external endpoints contacted
    - Any undeclared side effects
    Human must explicitly approve. No exceptions for external scripts.
        │
    ┌───┴───┐
    │       │
   YES      NO
    │       │
    ▼       ▼
[7a] Promote   [7b] Reject
  to             Quarantine
  src/instance/  and log
  scripts/
```

## Relationship to Existing Review Infrastructure

The intake pipeline **composes with** the existing review chain — it does not replace it.

| Dimension | DW pipeline (self-authored) | Intake pipeline (external) |
|---|---|---|
| Provenance | System-authored | Unknown/external |
| Review point | At generation time | At ingestion time |
| Human gate | FAFC (optional by config) | Always mandatory |
| Information barrier | N/A (system knows intent) | Strict (blind behavioral analysis first) |
| Destination on pass | `src/instance/scripts/` | `src/instance/scripts/` |
| Destination on fail | Discard | Quarantine + log |

Both paths end at the same destination. The intake pipeline adds the information barrier and mandatory human gate that are unnecessary (and impossible) for self-authored scripts.

The constitutional review step (`applyReview()`) is the same call used throughout the system. No new review infrastructure is needed for this step — the intake pipeline reuses it.

## Critical Path

Before this can be built, the following must exist (all currently implemented):

- `applyReview()` — constitutional review helper (`src/agents/reviewed.ts`)
- `handleFAFC()` — human judgment infrastructure (`src/agents/human-judgment-agent.ts`)
- Review logging — append-only JSONL (`src/agents/review-log.ts`)
- Developer/Writer staging area — `runtime/staging/scripts/` (used for analogous DW staging)

No unbuilt features are required. The intake pipeline is a new composition of existing components plus a deterministic comment-stripping step and the two-phase LLM analysis.

## Open Questions

See [GitHub issue #41](https://github.com/hikusukih/writ/issues/41) for the current refinement backlog. Key open questions:

- **Batch vs. one-at-a-time**: Does the intake pipeline process scripts individually or support bulk ingestion? Batch complicates the human gate UX.
- **Package/registry interaction**: If a future package concept groups scripts by publisher, does trust transfer? How does the intake pipeline interact with publisher-level trust decisions?
- **Quarantine retention policy**: How long are rejected scripts kept? Who can review or re-submit them? Append-only log of rejections vs. deletable quarantine?
- **Re-intake on script update**: If a script in the library is updated externally, does it re-enter the intake pipeline? It should — but the UX for "you approved v1, here is what changed in v2" is distinct from first-time intake.

## Security Notes

- The comment-stripping step is the intake gate's first defense against adversarial input. It must be a deterministic parser — not LLM-assisted — so that an attacker cannot craft comments that manipulate the stripping step itself.
- The information barrier (blind behavioral analysis) is the second defense. Its value depends entirely on the two LLM calls remaining separate. Any implementation that passes frontmatter to the behavioral analysis step has broken the barrier.
- Human approval is the last defense and the only one that cannot be circumvented by a sufficiently capable adversary. It is mandatory for this reason.
- Rejected scripts must be logged (not silently discarded) to support audit and pattern detection across intake attempts.
