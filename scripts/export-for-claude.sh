#!/usr/bin/env bash
# @name export-for-claude
# @description Export project docs into bundled files for uploading to a Claude Project
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
OUT="$ROOT/export"

DATE="$(date +%Y-%m-%d-%H)"
mkdir -p "$OUT" "$OUT/archive"
# Remove previous export bundles (top-level only; preserve archive/)
find "$OUT" -maxdepth 1 -name '*.md' -delete

# Helper: append a file with a clear header banner
append_file() {
  local file="$1"
  local label="${2:-$file}"
  echo "" >> "$OUT/$TARGET"
  echo "---" >> "$OUT/$TARGET"
  echo "# FILE: $label" >> "$OUT/$TARGET"
  echo "" >> "$OUT/$TARGET"
  cat "$file" >> "$OUT/$TARGET"
}

# ── 01 · Project Context ────────────────────────────────────────────────────
TARGET="01-${DATE}-project-context.md"
cat > "$OUT/$TARGET" << 'EOF'
# DomestiClaw — Project Context

This file bundles top-level project documentation for use in a Claude Project.
Contents: README, CLAUDE.md (developer guide), system identity files.

EOF

append_file "$ROOT/README.md"                           "README.md"
append_file "$ROOT/CLAUDE.md"                           "CLAUDE.md"
append_file "$ROOT/src/instance/identity/SOUL.md"                    "src/instance/identity/SOUL.md"
append_file "$ROOT/src/instance/identity/CONSTITUTION.md"            "src/instance/identity/CONSTITUTION.md"
append_file "$ROOT/src/instance/identity/registry.json"              "src/instance/identity/registry.json"

for f in "$ROOT"/src/instance/identity/agents/*.md; do
  append_file "$f" "src/instance/identity/agents/$(basename "$f")"
done

echo "  wrote $TARGET"

# ── 02 · Architecture ────────────────────────────────────────────────────────
TARGET="02-${DATE}-architecture.md"
cat > "$OUT/$TARGET" << 'EOF'
# DomestiClaw — Architecture Specifications

This file bundles all architecture and design specs.
Contents: system overview, agent invocation model, identity/state design,
model management, prompt evolution, per-agent specs, and background notes.

EOF

# Overview first for context, then everything else in docs/architecture/ recursively
append_file "$ROOT/docs/architecture/Overview.md" "docs/architecture/Overview.md"

while IFS= read -r f; do
  [[ "$f" == "$ROOT/docs/architecture/Overview.md" ]] && continue
  rel="${f#$ROOT/}"
  append_file "$f" "$rel"
done < <(find "$ROOT/docs/architecture" -type f -name "*.md" | sort)

echo "  wrote $TARGET"

# ── 03 · Planning & Working Docs ─────────────────────────────────────────────
TARGET="03-${DATE}-planning.md"
cat > "$OUT/$TARGET" << 'EOF'
# DomestiClaw — Planning, Background & Working Docs

This file bundles implementation roadmap, open design questions, background
notes, and working documents. Includes everything in docs/ outside architecture/.

EOF

# Everything in docs/ that isn't in docs/architecture/, iterated via find
while IFS= read -r f; do
  [[ "$f" == "$ROOT/docs/architecture/"* ]] && continue
  rel="${f#$ROOT/}"
  append_file "$f" "$rel"
done < <(find "$ROOT/docs" -type f -name "*.md" | sort)

echo "  wrote $TARGET"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "Export complete → $OUT"
echo ""
find "$OUT" -maxdepth 1 -name '*.md' -exec ls -lh {} +
