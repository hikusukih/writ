# ADR-0001: Gist-Based Command Channel for Live Instance

## Status
Accepted

## Context
The live deployed instance of Writ needs a way to receive commands from the operator without requiring an inbound network connection. The instance runs in an environment where exposing a port is undesirable or impractical, and the operator may need to send commands from a mobile device (phone). A pull-based channel is strongly preferred over push-based.

## Options Considered

| Option | Verdict | Reason |
|---|---|---|
| Exposed API endpoint | Rejected | Requires inbound ports; complicates deployment and security posture |
| File committed to GitHub repo | Rejected | Public visibility; pollutes commit history; awkward to overwrite |
| Google Docs | Rejected | Auth complexity; requires OAuth setup on the instance side |
| Private GitHub Gist | **Chosen** | Private, pull-based, no inbound ports, phone-writable via GitHub UI |

## Decision

Use a **private GitHub Gist** as the command channel for the live instance.

### Command format

Commands are plaintext, interpreted by the LLM pipeline. The operator writes to the Gist as if composing an email to the system — no special syntax required.

### Inbox pattern (filesystem dead drop)

The polling script fetches the Gist and writes its content to a local inbox file (e.g., `runtime/inbox/gist.txt`). This decouples polling from processing:

- The polling script is dumb infrastructure — fetch, write, done.
- Multiple components can write to the inbox (future: other input channels).
- LLM interpretation happens downstream in the pipeline, not in the poll script.

### Bootstrap cron

Initial scheduling is a temporary external cron (e.g., system crontab). This is a bootstrap measure only. Writ should self-schedule polling as one of its first self-management tasks once operational.

### Runtime directory

All runtime-generated files (inbox, logs, state) live in `runtime/` at the project root, which is gitignored. The inbox path is `runtime/inbox/`.

### Single-command-per-poll limitation

The Gist holds one command at a time. If the operator overwrites the Gist before the next poll, the earlier command is lost. This is **accepted** for MVP cadence (hourly polling). The operator is expected to treat the Gist as a single-slot inbox.

## Rationale

A pull-based channel with no inbound ports is the most deployment-friendly option for a self-hosted agent. Private Gists are accessible from any device with a GitHub account, require no additional infrastructure, and can be fetched with a simple `curl` + `GH_TOKEN`. The inbox/dead-drop pattern keeps the polling script minimal and makes the processing path testable independently.

## Consequences

- Polling script must be implemented and scheduled externally at bootstrap.
- `GH_TOKEN` with Gist read permission must be available to the instance at runtime.
- `runtime/inbox/` directory must be created before polling begins.
- Future IOAdapter integration will consume from the inbox path rather than from stdin.
- If multi-source input is desired later, the inbox pattern accommodates it without changes to the processing pipeline — see backlog item `backlog-multi-source-input.md`.
