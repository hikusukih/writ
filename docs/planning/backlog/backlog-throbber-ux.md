# Throbber / Acknowledgment UX

## Summary
Per-channel activity indicators and acknowledgment patterns for asynchronous job execution. Each IOAdapter implementation is responsible for its own throbber/spinner; the Orchestrator provides the timing contract.

## Motivation
When a job takes longer than expected, the user needs feedback: either a visual indicator that work is happening (throbber), or an explicit acknowledgment that the system received the request and will follow up. Without this, async jobs feel like the system has gone silent.

## Design Notes
The Orchestrator sets a configurable timeout per job type. If the job completes within the timeout, the response is synchronous — the user sees a brief activity indicator, then the result. If the job exceeds the timeout, the Orchestrator sends an acknowledgment message ("Working on it — I'll follow up when it's done") and delivers the result asynchronously when the job completes.

Implementation details are per-adapter: CLI might show a spinner, a chat integration might show a typing indicator, a web dashboard might show a progress bar. The IOAdapter interface defines the contract; adapters implement it however makes sense for their channel.

## Open Questions
- Default timeout per job type
- Acknowledgment message format (templated? LLM-generated?)
- Progress updates for long-running jobs (periodic? milestone-based?)

## Dependencies
IOAdapter — Messaging Interface, Job Graph & Scheduler.

## Unlocks
Responsive user-facing loop for async work.
