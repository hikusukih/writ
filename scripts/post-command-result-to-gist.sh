#!/usr/bin/env bash
# post-command-result-to-gist.sh
# Appends content to the Gist so Mike can check results from his phone.
# Mike reads accumulated output and clears manually.
#
# Usage:
#   echo "task complete" | ./scripts/post-command-result-to-gist.sh
#   ./scripts/post-command-result-to-gist.sh "task complete"
#
# Required env vars (from .env or environment):
#   WRIT_COMMAND_GIST_ID       — the Gist ID to post to
#   WRIT_GITHUB_TOKEN          — Gist-scoped PAT
#
# Optional env vars:
#   WRIT_COMMAND_GIST_FILENAME — filename within the Gist (default: command.txt)
#   WRIT_RUNTIME_DIR           — base runtime directory (default: ./runtime)
#
# Exit codes: 0 success, 1 failure

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

mkdir -p "$LOG_DIR"

log() {
  local level="$1"
  local msg="$2"
  local ts
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "$ts [$level] $msg" | tee -a "$LOG_FILE"
}

# Read new content from argument or stdin
if [[ $# -ge 1 ]]; then
  NEW_CONTENT="$1"
else
  NEW_CONTENT=$(cat)
fi

if [[ -z "$NEW_CONTENT" ]]; then
  echo "ERROR: no content provided (pass as argument or stdin)" >&2
  exit 1
fi

GIST_API_URL="https://api.github.com/gists/${GIST_ID}"

# Fetch current Gist content
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
  log "ERROR" "GitHub API returned HTTP $HTTP_CODE when fetching Gist"
  exit 1
fi

# Extract current content
CURRENT_CONTENT=$(python3 -c "
import sys, json
data = json.load(sys.stdin)
files = data.get('files', {})
filename = sys.argv[1]
if filename not in files:
    if files:
        filename = list(files.keys())[0]
    else:
        print('', end='')
        sys.exit(0)
print(files[filename].get('content', ''), end='')
" "$GIST_FILENAME" <<< "$HTTP_BODY") || {
  log "ERROR" "Failed to parse Gist API response"
  exit 1
}

# Build appended content with timestamp separator
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
if [[ -z "${CURRENT_CONTENT// }" ]]; then
  UPDATED_CONTENT="--- $TIMESTAMP ---
$NEW_CONTENT"
else
  UPDATED_CONTENT="$CURRENT_CONTENT

--- $TIMESTAMP ---
$NEW_CONTENT"
fi

# Write updated content back to Gist
ESCAPED_CONTENT=$(python3 -c "
import sys, json
content = sys.stdin.read()
print(json.dumps(content))
" <<< "$UPDATED_CONTENT")

PATCH_BODY="{\"files\":{\"${GIST_FILENAME}\":{\"content\":${ESCAPED_CONTENT}}}}"

PATCH_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X PATCH \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github.v3+json" \
  -H "Content-Type: application/json" \
  "$GIST_API_URL" \
  -d "$PATCH_BODY" 2>&1) || {
  log "ERROR" "curl failed when posting result to Gist"
  exit 1
}

PATCH_CODE=$(echo "$PATCH_RESPONSE" | tail -n 1)
if [[ "$PATCH_CODE" != "200" ]]; then
  log "ERROR" "Failed to post result to Gist (HTTP $PATCH_CODE)"
  exit 1
fi

log "INFO" "Result posted to Gist (${#NEW_CONTENT} bytes)"
exit 0
