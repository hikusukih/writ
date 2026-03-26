#!/bin/bash
# @name search-content
# @description Search for text in project files (scoped to project root)
# @param QUERY The text or pattern to search for
# @param FILE_PATTERN Optional glob pattern to limit search (e.g. "*.ts", defaults to all files)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ALLOWED_ROOT="${WRIT_ALLOWED_ROOT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

if [ -z "$QUERY" ]; then
  echo "Error: QUERY is required" >&2
  exit 1
fi

pattern="${FILE_PATTERN:-*}"

cd "$ALLOWED_ROOT" || { echo "Error: could not change to project root" >&2; exit 1; }

# Exclude common noise directories
grep -rn --include="$pattern" \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  --exclude-dir=.git \
  --exclude-dir=runtime \
  "$QUERY" . 2>/dev/null | head -50

if [ ${PIPESTATUS[0]} -ne 0 ]; then
  echo "No matches found for '$QUERY'"
fi
