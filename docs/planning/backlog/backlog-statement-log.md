# User Statement Log

## Summary
A persistent, append-only log of user statements the system considers *evidence* for work. Provides an N:N join between Jobs and Statements, enabling provenance queries, drift detection, and conflict detection across Initiatives.

## Motivation
Jobs and Initiatives need traceable justification. When the system is asked "why are you doing X?", the answer should trace back to specific user statements — not just a session transcript or a snapshot in an Initiative definition. The Statement Log is the persistent evidence layer that makes this possible.

Session history is ephemeral and comprehensive; USER.MD is a profile. The Statement Log sits between them: a curated, persistent subset of things the user has said that the system treats as actionable evidence.

## Design Notes

### Schema

```
Statement {
  id:              string
  text:            string          // the user's words (or a close paraphrase)
  source:          string          // session ID, IOAdapter channel, etc.
  timestamp:       datetime
  context:         string | null   // surrounding context that clarifies meaning
  superseded_by:   Statement.id | null
}
```

### Evidence Join

N:N relationship between Jobs and Statements via a `JobEvidence` join:

```
JobEvidence {
  job_id:          Job.id
  statement_id:    Statement.id
  relationship:    "motivates" | "constrains" | "supersedes_prior"
}
```

A single statement can motivate multiple jobs. A single job can cite multiple statements.

### Supersession Lifecycle

A new statement can mark an older one as superseded (e.g., "actually, make it 7am instead of 6am" supersedes the original "email me at 6am"). The `superseded_by` field links the old statement to its replacement.

Periodic sweep: the system detects active jobs citing superseded statements and flags them for review or re-planning.

### Relationship to Existing Concepts

- **Session history**: The Statement Log is a curated subset — not every message is evidence, only statements the system deems actionable.
- **USER.MD**: Profile-level preferences vs. task-specific evidence. "I like dark mode" is USER.MD. "Email me the weather at 6am" is a Statement.
- **Initiative definitions**: Initiatives reference Statements rather than embedding snapshots of user intent. This keeps Initiatives up-to-date when statements are superseded.

## Open Questions
- **Who decides what's worth logging?** The Orchestrator? A dedicated component? LLM judgment on every user message?
- **Granularity**: One statement per user message, or decomposed into atomic claims?
- **Storage format**: JSON files in `runtime/`? SQLite? Same store as Job state?
- **Supersession detection**: Manual only (user explicitly corrects), or inferred (LLM detects contradiction)?
- **Retention policy**: Statements accumulate forever? Age out? Archive after all citing jobs complete?

## Dependencies
Job Graph & Scheduler — evidence links reference Job IDs.

## Unlocks
Drift detection, provenance queries ("why are you doing X?"), conflict detection between Initiatives.
