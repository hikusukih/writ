#!/bin/bash
# Session startup hook for Writ planning/implementation environments.
# Runs on session start/resume in Claude Code on the web.
# Fetches GitHub issues and project board data into runtime/planning/ for Claude to read.

set -euo pipefail

REPO="hikusukih/writ"
PLANNING_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}/runtime/planning"
mkdir -p "$PLANNING_DIR"

# ── 1. Sync from main ────────────────────────────────────────────────────────
echo "=== Session Start ===" >&2
echo "Branch: $(git branch --show-current 2>/dev/null || echo unknown)" >&2

if git remote get-url origin &>/dev/null; then
  echo "Fetching latest from origin/main..." >&2
  git fetch origin main --quiet 2>/dev/null || echo "Warning: could not fetch origin/main" >&2
fi

# ── 2. GitHub issues ─────────────────────────────────────────────────────────
if [ -z "${GH_TOKEN:-}" ]; then
  echo "GH_TOKEN not set — skipping GitHub data fetch." >&2
  echo "Set GH_TOKEN in your cloud environment configuration to enable issue loading." >&2

  # Write a placeholder so Claude knows why the file is absent
  echo '{"error": "GH_TOKEN not set", "issues": [], "fetched_at": null}' > "$PLANNING_DIR/issues.json"
  echo '{"error": "GH_TOKEN not set", "items": [], "fetched_at": null}' > "$PLANNING_DIR/board.json"
else
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  AUTH_HEADER="Authorization: token $GH_TOKEN"
  ACCEPT_HEADER="Accept: application/vnd.github.v3+json"
  BASE="https://api.github.com/repos/$REPO"

  echo "Fetching GitHub issues..." >&2

  # All open issues (up to 100), with labels and metadata
  ISSUES=$(curl -sf \
    -H "$AUTH_HEADER" \
    -H "$ACCEPT_HEADER" \
    "${BASE}/issues?state=open&per_page=100&sort=updated&direction=desc" 2>/dev/null) || {
    echo "Warning: failed to fetch issues" >&2
    ISSUES="[]"
  }

  # Annotate with fetch timestamp
  echo "$ISSUES" | python3 -c "
import sys, json
data = json.load(sys.stdin)
# Trim to fields Claude needs; keep it small
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

  ISSUE_COUNT=$(python3 -c "import json; d=json.load(open('$PLANNING_DIR/issues.json')); print(d.get('count', 0))" 2>/dev/null || echo "?")
  echo "Fetched $ISSUE_COUNT open issues → runtime/planning/issues.json" >&2

  # ── 3. GitHub Projects (classic project boards) ───────────────────────────
  echo "Fetching project boards..." >&2

  # Try repo-level projects first
  PROJECTS=$(curl -sf \
    -H "$AUTH_HEADER" \
    -H "$ACCEPT_HEADER" \
    -H "Accept: application/vnd.github.inertia-preview+json" \
    "${BASE}/projects" 2>/dev/null) || PROJECTS="[]"

  PROJECT_COUNT=$(echo "$PROJECTS" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)

  if [ "$PROJECT_COUNT" -gt 0 ]; then
    # Fetch columns + cards for each project
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
                col['cards'].append({
                    'note': card.get('note'),
                    'content_url': card.get('content_url'),
                })
            proj['columns'].append(col)
    except Exception as e:
        proj['error'] = str(e)
    result.append(proj)
print(json.dumps({'fetched_at': '${TIMESTAMP}', 'projects': result}, indent=2))
" > "$PLANNING_DIR/board.json" 2>/dev/null || {
      echo "Warning: failed to fetch project board details" >&2
      echo "{\"fetched_at\": \"$TIMESTAMP\", \"projects\": []}" > "$PLANNING_DIR/board.json"
    }
    echo "Fetched $PROJECT_COUNT project board(s) → runtime/planning/board.json" >&2
  else
    echo "{\"fetched_at\": \"$TIMESTAMP\", \"note\": \"No classic project boards found. Check GitHub Projects (v2) in the web UI.\", \"projects\": []}" > "$PLANNING_DIR/board.json"
    echo "No classic project boards found (GitHub Projects v2 requires GraphQL — see /load-board-v2)" >&2
  fi
fi

# ── 4. Print context summary for Claude ──────────────────────────────────────
echo ""
echo "=== Planning Context Loaded ==="
echo "Branch: $(git branch --show-current 2>/dev/null || echo unknown)"
echo "Latest main: $(git log origin/main --oneline -1 2>/dev/null || echo 'not fetched')"
echo ""

if [ -f "$PLANNING_DIR/issues.json" ]; then
  python3 -c "
import json
try:
    d = json.load(open('$PLANNING_DIR/issues.json'))
    if 'error' in d:
        print(f'Issues: {d[\"error\"]}')
    else:
        issues = d.get('issues', [])
        on_deck = [i for i in issues if 'on-deck' in i.get('labels', [])]
        needs_ref = [i for i in issues if 'needs-refinement' in i.get('labels', [])]
        print(f'Open issues: {len(issues)} total | {len(on_deck)} on-deck | {len(needs_ref)} needs-refinement')
        if on_deck:
            print('On-deck:')
            for i in on_deck[:5]:
                print(f'  #{i[\"number\"]} {i[\"title\"]}')
        if len(on_deck) > 5:
            print(f'  ... and {len(on_deck)-5} more')
except Exception as e:
    print(f'Issues: could not parse ({e})')
" 2>/dev/null || echo "Issues: runtime/planning/issues.json present"
fi

echo ""
echo "Run /load-context to re-read issue files into the conversation."
echo "Run /change-directive to draft a Change Directive."
