#!/bin/bash
# @name git-status
# @description Show git status and recent commits in the project

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ALLOWED_ROOT="${WRIT_ALLOWED_ROOT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

cd "$ALLOWED_ROOT" || { echo "Error: could not change to project root" >&2; exit 1; }

echo "=== Git Status ==="
git status --short

echo ""
echo "=== Recent Commits ==="
git log --oneline -10
