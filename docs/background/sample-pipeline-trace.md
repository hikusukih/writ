# Sample Pipeline Trace: "Combine all architecture docs into one file"

A worked example showing what each layer produces for a simple user request. Illustrates the GP → LP → DW → Executor → Compiler chain including script commissioning.

---

## User Input

> Combine all the markdown files in docs/architecture/ into one file so I can read it offline.

---

## 1. General Planner — Strategic Plan

The GP assesses this as a single-step file operation with a known pattern. No multi-assignment decomposition needed.

**PLAN-a1b2c3.md** (human-readable):

```markdown
## Task
User wants to combine all markdown files in docs/architecture/ into a single readable file.

## Assessment
Single-step file operation. Known script pattern — this is a combine/concatenate task
scoped to the project directory. No multi-assignment decomposition needed.

## Assignments
1. Combine the architecture markdown files into one output file in the project root.
```

**StrategicPlan object** (structured, Zod-validated):

```json
{
  "id": "a1b2c3",
  "description": "Combine architecture docs into single file",
  "assignments": [
    {
      "id": "a1b2c3-1",
      "description": "Concatenate all .md files in docs/architecture/ into a single output file at the project root",
      "constraints": ["output should preserve filenames as section headers for readability"]
    }
  ]
}
```

---

## 2. Lieutenant Planner — Detailed Execution Spec

The LP receives the single work assignment, reads the script index, and discovers no combine/concatenate script exists.

**PLAN-a1b2c3-1.md** (human-readable):

```markdown
## Assignment
Concatenate all .md files in docs/architecture/ into a single output file at the project root.

## Available Scripts
Checked script index. Found: list-files, read-file, write-file, append-file,
git-status, search-content. No combine/concatenate script exists.

## Missing Scripts
- **combine-files**: Concatenate all files matching a glob in a directory into a
  single output file with filename headers as separators.

## Execution Plan (pending script creation)
1. Run @combine-files with SOURCE_DIR=docs/architecture/, OUTPUT_FILE=architecture-combined.md,
   FILE_PATTERN="*.md"
```

**LP structured return:**

```json
{
  "plan": {
    "task": "Combine architecture markdown files",
    "steps": [
      {
        "scriptId": "combine-files",
        "params": {
          "SOURCE_DIR": "docs/architecture/",
          "OUTPUT_FILE": "architecture-combined.md",
          "FILE_PATTERN": "*.md"
        }
      }
    ]
  },
  "missingScripts": [
    {
      "name": "combine-files",
      "capability": "Concatenate all files matching a glob pattern in a directory into a single output file. Should support a configurable separator between files, defaulting to filename headers. Scoped to ALLOWED_ROOT."
    }
  ]
}
```

---

## 3. Developer/Writer — Script Commissioning

LP detects `missingScripts` is non-empty. Calls `generateScript()` with the capability description. DW produces:

```bash
#!/bin/bash
# @name combine-files
# @description Concatenate all files in a directory into a single output file (scoped to project root)
# @param SOURCE_DIR Directory containing the files to combine
# @param OUTPUT_FILE Path for the combined output file
# @param FILE_PATTERN Optional glob pattern to filter files (e.g. "*.md", defaults to all files)
# @param SEPARATOR Optional separator between files (defaults to a filename header comment)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ALLOWED_ROOT="${DOMESTICLAW_ALLOWED_ROOT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

if [ -z "$SOURCE_DIR" ]; then
  echo "Error: SOURCE_DIR is required" >&2
  exit 1
fi

if [ -z "$OUTPUT_FILE" ]; then
  echo "Error: OUTPUT_FILE is required" >&2
  exit 1
fi

src_resolved=$(realpath "$SOURCE_DIR" 2>/dev/null)
out_resolved=$(realpath -m "$OUTPUT_FILE" 2>/dev/null)

if [[ "$src_resolved" != "$ALLOWED_ROOT"* ]]; then
  echo "Error: SOURCE_DIR '$SOURCE_DIR' is outside the allowed scope ($ALLOWED_ROOT)" >&2
  exit 1
fi

if [[ "$out_resolved" != "$ALLOWED_ROOT"* ]]; then
  echo "Error: OUTPUT_FILE '$OUTPUT_FILE' is outside the allowed scope ($ALLOWED_ROOT)" >&2
  exit 1
fi

if [ ! -d "$src_resolved" ]; then
  echo "Error: SOURCE_DIR not found or not a directory: $SOURCE_DIR" >&2
  exit 1
fi

pattern="${FILE_PATTERN:-*}"
separator="${SEPARATOR:-header}"

: > "$out_resolved"

count=0
for file in "$src_resolved"/$pattern; do
  [ -f "$file" ] || continue
  if [ "$separator" = "header" ]; then
    echo "===== $(basename "$file") =====" >> "$out_resolved"
  else
    [ $count -gt 0 ] && echo "$separator" >> "$out_resolved"
  fi
  cat "$file" >> "$out_resolved"
  echo "" >> "$out_resolved"
  count=$((count + 1))
done

if [ $count -eq 0 ]; then
  echo "No files matched pattern '$pattern' in $SOURCE_DIR" >&2
  rm -f "$out_resolved"
  exit 1
fi

echo "Combined $count file(s) into $OUTPUT_FILE"
```

**DW review cycle:**
1. DW-Reviewer checks: frontmatter valid, script does ONE thing, no hardcoded paths outside ALLOWED_ROOT, no secrets, no unbounded resource usage, params match description → **allow**
2. Script staged to `runtime/staging/scripts/combine-files.sh`
3. Promoted to live `src/instance/scripts/combine-files.sh`
4. Script index refreshed

---

## 4. Lieutenant Planner — Re-plan

LP re-reads the script index (now includes `combine-files`), confirms the plan is feasible, and returns the plan with `missingScripts: []`.

---

## 5. Executor — Instruction JSON

Maps the LP's plan steps to instruction JSON:

```json
{
  "instructions": [
    {
      "scriptId": "combine-files",
      "params": {
        "SOURCE_DIR": "docs/architecture/",
        "OUTPUT_FILE": "architecture-combined.md",
        "FILE_PATTERN": "*.md"
      }
    }
  ]
}
```

---

## 6. Compiler — Validation + Execution

1. **Validates**: `combine-files` exists in script index, `SOURCE_DIR` and `OUTPUT_FILE` are declared `@param`s, `FILE_PATTERN` is an optional `@param`
2. **Composes**: shell invocation with params as environment variables
3. **Runs**: executes the script, captures stdout/stderr/exit code
4. **Returns**: `{ exitCode: 0, stdout: "Combined 8 file(s) into architecture-combined.md", stderr: "" }`

---

## 7. Orchestrator — Response Synthesis

Orchestrator receives the execution result, makes a second LLM call to interpret it into natural language:

> I've combined all 8 markdown files from docs/architecture/ into `architecture-combined.md` at the project root. Each file is separated by a filename header so you can navigate between sections.

**Side-effect summary** (appended to conversation history):

```
[Side effects this turn: combine-files(SOURCE_DIR=docs/architecture/, OUTPUT_FILE=architecture-combined.md, FILE_PATTERN=*.md) → exit 0]
```

---

## Key Observations

- **LP doesn't jury-rig existing scripts.** It could chain `list-files` → `read-file` → `append-file` in a loop, but instead identifies the capability gap and commissions the right tool. The system grows its script library on demand.
- **GP stays strategic.** For a single-assignment task like this, the GP produces minimal overhead — one assignment, no decomposition. Complex requests would produce multiple assignments routed to separate LP invocations.
- **The script outlives the request.** Next time any agent needs to combine files, `combine-files` is already in the index. The DW cost is paid once.
- **Review happens at every boundary.** GP output → reviewed. LP output → reviewed. DW script → reviewed before promotion. Executor instructions → validated by Compiler. Final response → reviewed before user sees it.
