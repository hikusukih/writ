# Initiative Table & Persistence

## Summary
A persistent table for Initiatives, separate from the Job table. Initiatives own *why* and *when*; Jobs own *what* and *how*. When an Initiative's cron fires, it creates (or re-runs) a Job — the Initiative itself doesn't execute work directly.

## Motivation
The existing Initiative description in `Overview.md` describes behavioral patterns and architecture types but not persistence. An Initiative needs to survive restarts, be queryable ("what ongoing things do I have?"), and maintain traceable links to the user statements that motivated it. A persistent table with its own schema — distinct from the Job table — makes this possible.

## Design Notes

### Schema

```
Initiative {
  id:              string
  definition:      string          // goals, success criteria (natural language)
  status:          enum            // "active" | "paused" | "completed" | "stopped"
  owner_class:     "user" | "system"  // "user" = user-created; "system" = Adjutant-created (maintenance)
  cron:            string          // cron expression (e.g. "0 6 * * *")
  architecture:    enum            // "static" | "supervised" | "agentic" | "reactive"
  evidence:        StatementRef[]  // user statements that motivate this initiative
  created_at:      datetime
  stop_condition:  string | null   // date-based, condition-based (LLM evaluates), or null (manual only)
}
```

### Separation from Jobs

The Initiative table and Job table are separate concerns:

- "What are you working on right now?" → Job table (in-flight jobs)
- "What ongoing things do I have?" → Initiative table (active initiatives)
- "Why are you doing X?" → Initiative → evidence → Statement Log

When an Initiative's cron fires, it creates or references a Job in the Job table. The Initiative doesn't execute work directly.

### Stop Conditions

- **Date-based**: Stop after a specific date (e.g., "end of trip")
- **Condition-based**: LLM evaluates whether a condition is met (e.g., "stop when the project is deployed")
- **Manual**: User explicitly stops the Initiative

### Owner Class

System-class initiatives (`owner_class: "system"`) are created by the Adjutant and represent predefined maintenance tasks (CVE scans, dependency updates, security audits). They are modifiable only via sudo-like mediation — the same pattern used for Soul edits. User-class initiatives (`owner_class: "user"`) are created through normal Orchestrator → Initiative Builder flow.

### InitiativeCreationAgent

Already described in `Overview.md` as the agent that sets up Initiatives. No change to that agent's role — this backlog item formalizes *where* it writes (the Initiative table) and *what fields* it populates.

## Open Questions
- **Cron mechanism**: System crontab entry? Internal scheduler? IOAdapter inbound trigger on a timer?
- **Initiative ↔ Job status interaction**: If an Initiative is paused, what happens to in-flight Jobs it spawned? Cancel them? Let them finish? Block new ones only?
- **Storage format**: Same persistent store as Job state? Separate file/DB?
- **Initiative updates**: Can an Initiative's definition or cron be modified after creation, or is it stop-and-recreate?

## Dependencies
Job Graph & Scheduler, User Statement Log.

## Unlocks
Recurring autonomous work, time-bounded tasks, user-queryable ongoing work.
