#!/bin/bash
# @name append-file
# @description Append content to a file (scoped to project root)
# @param FILE_PATH Path to the file to append to
# @param CONTENT Content to append

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ALLOWED_ROOT="${DOMESTICLAW_ALLOWED_ROOT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

if [ -z "$FILE_PATH" ]; then
  echo "Error: FILE_PATH is required" >&2
  exit 1
fi

if [ -z "$CONTENT" ]; then
  echo "Error: CONTENT is required" >&2
  exit 1
fi

parent_dir=$(dirname "$FILE_PATH")
resolved_parent=$(realpath "$parent_dir" 2>/dev/null)

if [[ "$resolved_parent" != "$ALLOWED_ROOT"* ]]; then
  echo "Error: path '$FILE_PATH' is outside the allowed scope ($ALLOWED_ROOT)" >&2
  exit 1
fi

mkdir -p "$resolved_parent" || { echo "Error: failed to create directory '$resolved_parent'" >&2; exit 1; }
printf '%s\n' "$CONTENT" >> "$FILE_PATH" || { echo "Error: failed to append to '$FILE_PATH'" >&2; exit 1; }
echo "Appended to $FILE_PATH"
