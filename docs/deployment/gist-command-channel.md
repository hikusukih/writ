# Gist Command Channel

## What This Does and Why

The Gist command channel is a **pull-based dead drop** for sending commands to a live Writ instance without requiring any inbound network ports on the host machine.

The pattern:
1. You write a plaintext command to a private GitHub Gist (from browser or phone)
2. A cron job on the Writ host polls the Gist periodically
3. The poll script reads the command, writes it as a `.cmd` file to `runtime/inbox/`, and clears the Gist
4. A future IOAdapter integration will read `.cmd` files from the inbox and feed them into the Writ pipeline

The poll and post scripts are **dumb infrastructure** — no LLM involvement, no Writ pipeline, just HTTP and filesystem operations.

## Components

| File | Purpose |
|------|---------|
| `scripts/poll-command-from-gist.sh` | Reads Gist → writes to inbox → clears Gist |
| `scripts/post-command-result-to-gist.sh` | Appends result text back to the Gist |
| `runtime/inbox/` | Drop zone for incoming `.cmd` files |
| `runtime/logs/gist-poll.log` | Append-only event log |

## Environment Variables

All configuration is read from `.env` at the project root, or from the environment directly.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WRIT_COMMAND_GIST_ID` | Yes | — | The Gist ID to poll (the hash in the Gist URL) |
| `WRIT_GITHUB_TOKEN` | Yes | — | A GitHub PAT with `gist` scope only |
| `WRIT_COMMAND_GIST_FILENAME` | No | `command.txt` | The filename within the Gist |
| `WRIT_RUNTIME_DIR` | No | `./runtime` | Base runtime directory |

Add to `.env`:
```
WRIT_COMMAND_GIST_ID=abc123def456...
WRIT_COMMAND_GIST_FILENAME=command.txt
WRIT_GITHUB_TOKEN=github_pat_...
```

## Creating the Gist

1. Go to https://gist.github.com
2. Create a **secret** (private) Gist
3. Add a file named `command.txt` (or whatever you set `WRIT_COMMAND_GIST_FILENAME` to)
4. The Gist ID is the hash at the end of the URL: `https://gist.github.com/<username>/<GIST_ID>`

## Creating the PAT

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens (or classic)
2. Grant **only** `gist` scope — no other permissions needed
3. Store the token in `.env` as `WRIT_GITHUB_TOKEN`
4. Set file permissions: `chmod 600 .env`

## Manual Test Procedure

**Test poll (non-empty Gist):**
1. Write some text into your Gist's `command.txt` file (via GitHub web UI or API)
2. Run: `./scripts/poll-command-from-gist.sh`
3. Verify: a `.cmd` file appears in `runtime/inbox/`
4. Verify: the Gist content is now empty (or whitespace)
5. Verify: `runtime/logs/gist-poll.log` contains an INFO entry

**Test poll (empty Gist):**
1. Ensure the Gist is empty
2. Run: `./scripts/poll-command-from-gist.sh`
3. Verify: no new file in `runtime/inbox/`, no error output, log unchanged

**Test post result:**
1. Run: `echo "task complete" | ./scripts/post-command-result-to-gist.sh`
2. Verify: the Gist now contains a timestamped entry with "task complete"
3. Run again with different text — verify it appends rather than overwrites

**Test bad token:**
1. Temporarily set `WRIT_GITHUB_TOKEN=bad_token`
2. Run: `./scripts/poll-command-from-gist.sh`
3. Verify: exits non-zero, error logged, Gist untouched, no inbox file written

## Bootstrap Cron Setup

Until Writ manages its own polling via the job/initiative system, a cron job serves as the bootstrap mechanism.

Add to crontab (`crontab -e`):
```
0 * * * * cd /path/to/writ && ./scripts/poll-command-from-gist.sh >> /path/to/writ/runtime/logs/gist-poll-cron.log 2>&1
```

This polls once per hour. Adjust the schedule as needed (e.g., `*/15 * * * *` for every 15 minutes).

**Note:** This cron is a bootstrap mechanism only. One of the first things Writ should take over is scheduling its own polling via its internal job/initiative system, eliminating the need for external cron. See the open issue on self-scheduled polling.

## Security Notes

- The PAT should be **Gist-scoped only** — no repo, no user, no other permissions
- Set `.env` permissions to 600: `chmod 600 .env`
- The Gist should be **secret** (private), not public
- The poll script clears the Gist after reading — commands are not left exposed
- If the clear step fails, the `.cmd` file is still written and the error is logged; the Gist will be re-read and potentially re-processed on the next poll (inbox consumers should handle duplicates gracefully)

## Inbox File Format

Each `.cmd` file in `runtime/inbox/` contains the raw plaintext content of the Gist at the time it was polled. Filename format: `<ISO-8601-timestamp>.cmd` with colons replaced by hyphens for filesystem safety (e.g., `2026-03-22T14-30-00Z.cmd`).

## Open Items

- **IOAdapter inbox integration**: A future task will wire the inbox into the Writ pipeline — either via `IOAdapter` or a new `GistAdapter` that reads `.cmd` files and feeds them as plaintext user input.
- **Self-scheduled polling**: Replace the bootstrap cron with a Writ-managed scheduled job.
- **Concurrent execution guard**: If cron fires while Writ is processing a previous command, a lockfile or queue mechanism may be needed.
