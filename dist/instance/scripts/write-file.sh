#!/bin/bash
# @name write-file
# @description Write content to a file (scoped to project root)
# @param FILE_PATH Path to the file to write
# @param CONTENT Content to write to the file

ALLOWED_ROOT="/home/dmb/code/domestiClaw"

if [ -z "$FILE_PATH" ]; then
  echo "Error: FILE_PATH is required" >&2
  exit 1
fi

if [ -z "$CONTENT" ]; then
  echo "Error: CONTENT is required" >&2
  exit 1
fi

# Resolve parent dir (file may not exist yet)
parent_dir=$(dirname "$FILE_PATH")
resolved_parent=$(realpath "$parent_dir" 2>/dev/null)

if [[ "$resolved_parent" != "$ALLOWED_ROOT"* ]]; then
  echo "Error: path '$FILE_PATH' is outside the allowed scope ($ALLOWED_ROOT)" >&2
  exit 1
fi

echo "$CONTENT" > "$FILE_PATH"
echo "Written to $FILE_PATH"
