#!/bin/bash
# Summarize the current state of the repository.
# Outputs a markdown summary suitable for planning conversations.
# Called automatically by session-start.sh in the planning env; safe to run standalone.
#
# Uses ~/.writ/planning/issues.json cache if present (written by session-start.sh),
# otherwise falls back to direct GitHub API calls if GH_TOKEN is set.
#
# Note: does NOT run npm tests — too slow for auto-run. Run manually if needed.

set -euo pipefail

REPO="hikusukih/writ"
PLANNING_DIR="$HOME/.writ/planning"

echo "# Development Summary"
echo "_Generated: $(date -u +"%Y-%m-%d %H:%M UTC")_"
echo ""

# ── 1. Merged PRs (last 30 days) ──────────────────────────────────────────────
echo "## Merged PRs (last 30 days)"
MERGES=$(git log --oneline --merges origin/main --since="30 days ago" 2>/dev/null) || MERGES=""
if [ -n "$MERGES" ]; then
  echo "$MERGES" | sed 's/^/- /'
else
  echo "_None._"
fi
echo ""

# ── 2. Open branches ──────────────────────────────────────────────────────────
echo "## Open Branches"
git branch -r 2>/dev/null \
  | grep -v HEAD \
  | grep -v "origin/main$" \
  | grep -v "origin/planning$" \
  | sed 's|.*origin/||' \
  | sed 's/^/- /' \
  || echo "_None._"
echo ""

# ── 3. Issues by label ────────────────────────────────────────────────────────
echo "## Issues"

print_issues_from_cache() {
  python3 -c "
import json, sys
try:
    d = json.load(open('$PLANNING_DIR/issues.json'))
    if 'error' in d:
        print('_' + d['error'] + '_')
        sys.exit(0)
    issues = d.get('issues', [])
    for label in ['on-deck', 'needs-refinement', 'blocked']:
        filtered = [i for i in issues if label in i.get('labels', [])]
        print(f'### {label} ({len(filtered)})')
        for i in filtered:
            print(f'- #{i[\"number\"]} [{i[\"title\"]}]({i[\"url\"]})')
        if not filtered:
            print('_None._')
        print()
except Exception as e:
    print(f'_Could not parse issues cache: {e}_')
" 2>/dev/null
}

print_issues_from_api() {
  for label in on-deck needs-refinement blocked; do
    echo "### $label"
    curl -sf \
      -H "Authorization: token $GH_TOKEN" \
      -H "Accept: application/vnd.github.v3+json" \
      "https://api.github.com/repos/$REPO/issues?state=open&labels=$label&per_page=50" 2>/dev/null \
      | python3 -c "
import sys, json
try:
    issues = json.load(sys.stdin)
    for i in issues:
        print(f'- #{i[\"number\"]} [{i[\"title\"]}]({i[\"html_url\"]})')
    if not issues:
        print('_None._')
except Exception as e:
    print(f'_Parse error: {e}_')
" 2>/dev/null || echo "_Fetch failed._"
    echo ""
  done
}

if [ -f "$PLANNING_DIR/issues.json" ]; then
  print_issues_from_cache
elif [ -n "${GH_TOKEN:-}" ]; then
  print_issues_from_api
else
  echo "_No cache and GH_TOKEN not set._"
  echo ""
fi

# ── 4. Changes from main ──────────────────────────────────────────────────────
echo "## Changes from main"
CHANGED=$(git diff --name-only origin/main HEAD 2>/dev/null) || CHANGED=""
if [ -n "$CHANGED" ]; then
  echo "$CHANGED" | sed 's/^/- /'
else
  echo "_No changes from main._"
fi
echo ""

# ── 5. Recent commits ─────────────────────────────────────────────────────────
echo "## Recent Commits"
git log --oneline -10 2>/dev/null | sed 's/^/- /' || echo "_No commits._"
echo ""

# ── 6. TODOs and FIXMEs ───────────────────────────────────────────────────────
echo "## TODOs / FIXMEs"
TODO_OUTPUT=$(grep -rn "TODO\|FIXME\|HACK\|XXX" src/ --include="*.ts" 2>/dev/null) || TODO_OUTPUT=""
if [ -n "$TODO_OUTPUT" ]; then
  echo '```'
  echo "$TODO_OUTPUT"
  echo '```'
else
  echo "_None found._"
fi
