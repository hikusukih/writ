#!/usr/bin/env bash
# poll-command-from-gist.sh
# Reads a private GitHub Gist, writes content to a local inbox, and clears the Gist.
# This is dumb infrastructure — no LLM involvement.
#
# Required env vars (from .env or environment):
#   WRIT_COMMAND_GIST_ID       — the Gist ID to poll
#   WRIT_GITHUB_TOKEN          — Gist-scoped PAT
#
# Optional env vars:
#   WRIT_COMMAND_GIST_FILENAME — filename within the Gist (default: command.txt)
#   WRIT_RUNTIME_DIR           — base runtime directory (default: ./runtime)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# Load .env if present
if [[ -f "$REPO_ROOT/.env" ]]; then
  # shellcheck disable=SC2046
  export $(grep -E '^[A-Z_]+=.' "$REPO_ROOT/.env" | grep -v '^#' | xargs) 2>/dev/null || true
fi

# Config with defaults
GIST_ID="${WRIT_COMMAND_GIST_ID:-}"
GIST_FILENAME="${WRIT_COMMAND_GIST_FILENAME:-command.txt}"
GITHUB_TOKEN="${WRIT_GITHUB_TOKEN:-}"
RUNTIME_DIR="${WRIT_RUNTIME_DIR:-$REPO_ROOT/runtime}"

INBOX_DIR="$RUNTIME_DIR/inbox"
LOG_DIR="$RUNTIME_DIR/logs"
LOG_FILE="$LOG_DIR/gist-poll.log"

# Validate required vars
if [[ -z "$GIST_ID" ]]; then
  echo "ERROR: WRIT_COMMAND_GIST_ID is not set" >&2
  exit 1
fi
if [[ -z "$GITHUB_TOKEN" ]]; then
  echo "ERROR: WRIT_GITHUB_TOKEN is not set" >&2
  exit 1
fi

# Ensure runtime subdirectories exist
mkdir -p "$INBOX_DIR" "$LOG_DIR"

log() {
  local level="$1"
  local msg="$2"
  local ts
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "$ts [$level] $msg" | tee -a "$LOG_FILE"
}

# Fetch Gist content
GIST_API_URL="https://api.github.com/gists/${GIST_ID}"
HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github.v3+json" \
  "$GIST_API_URL" 2>&1) || {
  log "ERROR" "curl failed to reach GitHub API"
  exit 1
}

HTTP_BODY=$(echo "$HTTP_RESPONSE" | head -n -1)
HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -n 1)

if [[ "$HTTP_CODE" != "200" ]]; then
  log "ERROR" "GitHub API returned HTTP $HTTP_CODE — Gist untouched"
  exit 1
fi

# Extract file content using python (avoids jq dependency)
CONTENT=$(python3 -c "
import sys, json
data = json.load(sys.stdin)
files = data.get('files', {})
filename = sys.argv[1]
if filename not in files:
    # Try first file if exact name not found
    if files:
        filename = list(files.keys())[0]
    else:
        sys.exit(0)
print(files[filename].get('content', ''), end='')
" "$GIST_FILENAME" <<< "$HTTP_BODY") || {
  log "ERROR" "Failed to parse Gist API response"
  exit 1
}

# If content is empty or whitespace-only, exit silently
if [[ -z "${CONTENT// }" ]]; then
  exit 0
fi

# Write content to inbox with filesystem-safe ISO 8601 timestamp
TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
CMD_FILE="$INBOX_DIR/${TIMESTAMP}.cmd"
printf '%s' "$CONTENT" > "$CMD_FILE"

log "INFO" "Command received → $CMD_FILE (${#CONTENT} bytes)"

# Clear the Gist (overwrite with empty string)
CLEAR_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X PATCH \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github.v3+json" \
  -H "Content-Type: application/json" \
  "$GIST_API_URL" \
  -d "{\"files\":{\"${GIST_FILENAME}\":{\"content\":\" \"}}}" 2>&1) || {
  log "ERROR" "Failed to clear Gist (curl error) — inbox file retained"
  exit 1
}

CLEAR_CODE=$(echo "$CLEAR_RESPONSE" | tail -n 1)
if [[ "$CLEAR_CODE" != "200" ]]; then
  log "ERROR" "Failed to clear Gist (HTTP $CLEAR_CODE) — inbox file retained"
  exit 1
fi

log "INFO" "Gist cleared successfully"
exit 0
