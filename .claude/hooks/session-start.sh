#!/bin/bash
# Session startup hook for Writ.
# Runs on session start/resume in every Claude Code environment.
#
# Always:
#   1. Fetch origin/main (rebase reference)
#   2. Print branch + latest main
#
# Planning env only (CLAUDE_DEV_ENV_ID=planning):
#   3. Fetch origin/planning (cache branch)
#   4. Load planning data (GitHub API or cache fallback)
#   5. Push snapshot to planning branch
#   6. Print issue summary + auto-run directive

set -euo pipefail

REPO="hikusukih/writ"

echo "=== Session Start ===" >&2
echo "Branch: $(git branch --show-current 2>/dev/null || echo unknown)" >&2

# ── 1. Fetch origin/main ──────────────────────────────────────────────────────
if git remote get-url origin &>/dev/null; then
  git fetch origin main --quiet 2>/dev/null || echo "Warning: could not fetch origin/main" >&2
fi

# ── 2. Print base context (all environments) ──────────────────────────────────
echo ""
echo "=== Session Context ==="
echo "Branch: $(git branch --show-current 2>/dev/null || echo unknown)"
echo "Latest main: $(git log origin/main --oneline -1 2>/dev/null || echo 'not fetched')"

# ── Planning env only ─────────────────────────────────────────────────────────
if [ "${CLAUDE_DEV_ENV_ID:-}" != "planning" ]; then
  exit 0
fi

PLANNING_DIR="$HOME/.writ/planning"
mkdir -p "$PLANNING_DIR"

# ── 3. Fetch planning branch (cache) ─────────────────────────────────────────
PLANNING_BRANCH_EXISTS=false
if git fetch origin planning --quiet 2>/dev/null; then
  PLANNING_BRANCH_EXISTS=true
fi

# ── 4. Load planning data ─────────────────────────────────────────────────────
if [ -z "${GH_TOKEN:-}" ]; then
  # No token — try reading from planning branch cache
  echo "GH_TOKEN not set — trying planning branch cache..." >&2

  if $PLANNING_BRANCH_EXISTS && \
     git show origin/planning:issues.json > "$PLANNING_DIR/issues.json" 2>/dev/null && \
     git show origin/planning:board.json  > "$PLANNING_DIR/board.json"  2>/dev/null; then
    CACHED_AT=$(python3 -c "
import json
try:
    d = json.load(open('$PLANNING_DIR/issues.json'))
    print(d.get('fetched_at', 'unknown date'))
except Exception:
    print('unknown date')
" 2>/dev/null || echo "unknown date")
    echo "Loaded planning cache from planning branch (snapshot: $CACHED_AT)" >&2
    echo "Set GH_TOKEN to fetch fresh data and update the cache." >&2
  else
    echo "No planning branch cache found. Set GH_TOKEN to fetch from GitHub." >&2
    echo '{"error": "GH_TOKEN not set, no cache available", "issues": [], "fetched_at": null}' \
      > "$PLANNING_DIR/issues.json"
    echo '{"error": "GH_TOKEN not set, no cache available", "items": [], "fetched_at": null}' \
      > "$PLANNING_DIR/board.json"
  fi
else
  # Token available — fetch live from GitHub API
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  AUTH_HEADER="Authorization: token $GH_TOKEN"
  ACCEPT_HEADER="Accept: application/vnd.github.v3+json"
  BASE="https://api.github.com/repos/$REPO"

  echo "Fetching GitHub issues..." >&2

  ISSUES=$(curl -sf \
    -H "$AUTH_HEADER" \
    -H "$ACCEPT_HEADER" \
    "${BASE}/issues?state=open&per_page=100&sort=updated&direction=desc" 2>/dev/null) || {
    echo "Warning: failed to fetch issues" >&2
    ISSUES="[]"
  }

  echo "$ISSUES" | python3 -c "
import sys, json
data = json.load(sys.stdin)
trimmed = [{
  'number': i['number'],
  'title': i['title'],
  'state': i['state'],
  'labels': [l['name'] for l in i.get('labels', [])],
  'assignees': [a['login'] for a in i.get('assignees', [])],
  'milestone': i['milestone']['title'] if i.get('milestone') else None,
  'created_at': i['created_at'],
  'updated_at': i['updated_at'],
  'url': i['html_url'],
  'body_preview': (i.get('body') or '')[:300],
} for i in data if not i.get('pull_request')]
print(json.dumps({'fetched_at': '${TIMESTAMP}', 'count': len(trimmed), 'issues': trimmed}, indent=2))
" > "$PLANNING_DIR/issues.json" 2>/dev/null || {
    echo "Warning: failed to process issues JSON" >&2
    echo '{"error": "json processing failed", "issues": []}' > "$PLANNING_DIR/issues.json"
  }

  ISSUE_COUNT=$(python3 -c "
import json
d = json.load(open('$PLANNING_DIR/issues.json'))
print(d.get('count', 0))
" 2>/dev/null || echo "?")
  echo "Fetched $ISSUE_COUNT open issues → ~/.writ/planning/issues.json" >&2

  # Project boards
  echo "Fetching project boards..." >&2

  PROJECTS=$(curl -sf \
    -H "$AUTH_HEADER" \
    -H "$ACCEPT_HEADER" \
    -H "Accept: application/vnd.github.inertia-preview+json" \
    "${BASE}/projects" 2>/dev/null) || PROJECTS="[]"

  PROJECT_COUNT=$(echo "$PROJECTS" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)

  if [ "$PROJECT_COUNT" -gt 0 ]; then
    echo "$PROJECTS" | python3 -c "
import sys, json, urllib.request, os

token = os.environ.get('GH_TOKEN', '')
headers = {'Authorization': f'token {token}', 'Accept': 'application/vnd.github.inertia-preview+json'}

def gh_get(url):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

projects = json.load(sys.stdin)
result = []
for p in projects:
    proj = {'id': p['id'], 'name': p['name'], 'url': p['html_url'], 'columns': []}
    try:
        cols = gh_get(p['columns_url'])
        for c in cols:
            col = {'name': c['name'], 'cards': []}
            cards = gh_get(c['cards_url'] + '?per_page=50')
            for card in cards:
                col['cards'].append({'note': card.get('note'), 'content_url': card.get('content_url')})
            proj['columns'].append(col)
    except Exception as e:
        proj['error'] = str(e)
    result.append(proj)
print(json.dumps({'fetched_at': '${TIMESTAMP}', 'projects': result}, indent=2))
" > "$PLANNING_DIR/board.json" 2>/dev/null || {
      echo "Warning: failed to fetch project board details" >&2
      echo "{\"fetched_at\": \"$TIMESTAMP\", \"projects\": []}" > "$PLANNING_DIR/board.json"
    }
    echo "Fetched $PROJECT_COUNT project board(s) → ~/.writ/planning/board.json" >&2
  else
    echo "{\"fetched_at\": \"$TIMESTAMP\", \"note\": \"No classic project boards found.\", \"projects\": []}" \
      > "$PLANNING_DIR/board.json"
    echo "No classic project boards found (GitHub Projects v2 requires GraphQL)" >&2
  fi

  # ── 5. Push snapshot to planning branch (git plumbing, no checkout) ───────────
  echo "Updating planning branch cache..." >&2
  BLOB_ISSUES=$(git hash-object -w "$PLANNING_DIR/issues.json" 2>/dev/null) || BLOB_ISSUES=""
  BLOB_BOARD=$(git hash-object -w "$PLANNING_DIR/board.json" 2>/dev/null)  || BLOB_BOARD=""

  if [ -n "$BLOB_ISSUES" ] && [ -n "$BLOB_BOARD" ]; then
    TREE=$(printf "100644 blob %s\tissues.json\n100644 blob %s\tboard.json\n" \
      "$BLOB_ISSUES" "$BLOB_BOARD" | git mktree 2>/dev/null) || TREE=""

    if [ -n "$TREE" ]; then
      PARENT=$(git rev-parse origin/planning 2>/dev/null || echo "")
      if [ -n "$PARENT" ]; then
        COMMIT=$(git commit-tree "$TREE" -p "$PARENT" \
          -m "planning: snapshot $TIMESTAMP" 2>/dev/null) || COMMIT=""
      else
        COMMIT=$(git commit-tree "$TREE" \
          -m "planning: initial snapshot $TIMESTAMP" 2>/dev/null) || COMMIT=""
      fi

      if [ -n "$COMMIT" ]; then
        git push origin "$COMMIT:refs/heads/planning" --quiet 2>/dev/null \
          && echo "Planning branch cache updated." >&2 \
          || echo "Note: could not push planning branch cache (non-fatal)." >&2
      fi
    fi
  fi
fi

# ── 6. Run summarize script ───────────────────────────────────────────────────
echo ""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/../scripts/summarize.sh" 2>/dev/null || echo "Warning: summarize script failed" >&2

echo ""
echo "Run /load-context to re-read issue files into the conversation."
echo "Run /state-of-system for a deep architecture review."
