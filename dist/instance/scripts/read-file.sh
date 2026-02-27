#!/bin/bash
# @name read-file
# @description Read a file and display with line numbers (scoped to project root)
# @param FILE_PATH Path to the file to read

ALLOWED_ROOT="/home/dmb/code/domestiClaw"

if [ -z "$FILE_PATH" ]; then
  echo "Error: FILE_PATH is required" >&2
  exit 1
fi

resolved=$(realpath "$FILE_PATH" 2>/dev/null)

if [[ "$resolved" != "$ALLOWED_ROOT"* ]]; then
  echo "Error: path '$FILE_PATH' is outside the allowed scope ($ALLOWED_ROOT)" >&2
  exit 1
fi

if [ ! -f "$resolved" ]; then
  echo "Error: File not found: $FILE_PATH" >&2
  exit 1
fi

cat -n "$resolved"
