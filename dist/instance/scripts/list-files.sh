#!/bin/bash
# @name list-files
# @description List files in a directory (scoped to project root)
# @param TARGET_DIR The directory to list (defaults to project root)

ALLOWED_ROOT="/home/dmb/code/domestiClaw"
dir="${TARGET_DIR:-$ALLOWED_ROOT}"
resolved=$(realpath "$dir" 2>/dev/null)

if [[ "$resolved" != "$ALLOWED_ROOT"* ]]; then
  echo "Error: path '$dir' is outside the allowed scope ($ALLOWED_ROOT)" >&2
  exit 1
fi

ls -la "$resolved"
