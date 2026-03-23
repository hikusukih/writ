# Backlog: Multi-Source Input

## Summary

Support an array of input sources rather than a single command channel, with the ability to add, revoke, and assign roles to sources at runtime.

## Motivation

The current Gist command channel stores a single Gist URL in `.env`. This works for a single operator but limits the system in several ways:

- Only one human can send commands without sharing a Gist credential.
- If a source is compromised, the only recourse is to rotate the Gist (requiring a redeploy or `.env` edit).
- All input arrives over the same channel with no ability to distinguish source identity or apply per-source trust levels.

## Concept

Replace the single `GIST_URL` env var with a structured list of input sources. Each source has:

- A **URL or identifier** (e.g., Gist ID, webhook path, file path)
- A **channel type** (gist, file, webhook, etc.)
- A **label** (human-readable name for the source, e.g., "primary-operator", "mobile")
- An **active/revoked flag**

The polling loop iterates all active sources and merges their inputs into the inbox.

## Capabilities Enabled

- **Multi-user access**: Different operators can send commands via separate Gists without sharing credentials.
- **Compromised-source revocation**: Mark a source as revoked without touching other channels.
- **Channel diversity**: Mix input types (Gist, local file, future HTTP endpoint) without pipeline changes.
- **Per-source trust levels**: Future — assign different review stringency to untrusted vs. trusted sources.

## Open Questions

- Should source management itself be a command (i.e., operator sends "add source X" via existing channel)?
- Where does the source list live — `.env`, `runtime/`, or an identity config file?
- What happens when two sources deliver conflicting commands in the same poll cycle?

## Dependencies

- Gist command channel (ADR-0001) must be operational first.
- Source revocation requires a persistent source registry (similar to `runtime/` state files).

## Related

- [ADR-0001: Gist-Based Command Channel](../../decisions/0001-gist-command-channel.md)
