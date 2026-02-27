# Writ

A self-improving, locally-deployed multi-agent system. Inspired by OpenClaw, marginally safer.

## Quick Start

```bash
# Clone and install
git clone <repo-url>
cd writ
npm install

# Configure
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Run
npm run dev
```

## What It Does

Writ takes your requests and routes them through a chain of specialized agents:

1. **Orchestrator** interprets your intent and synthesizes the final response
2. **General [*Planner*](docs/dictionary.md)** partitions work into assignments; **Lieutenant Planner** produces script-level plans
3. **Developer/Writer** generates new scripts on demand (reviewed before promotion to permanent, system-available executables)
4. **Executor** maps plans to instruction JSON; **[*Compiler*](docs/dictionary.md)** validates and runs scripts
5. **LLM [*Reviewer*](docs/dictionary.md)** checks all agent output against SOUL.md + CONSTITUTION.md; rule-based reviewer as fast fallback
6. **Self-improvement chain**: Reviewer-Reviewer audits review decisions; BIG_BROTHER updates agent configs

Each step is logged, auditable, and attributed.

*As often as possible,* repeatable, deterministic code is called, or generated. LLMs are used to interpret user intent, and for communication with the user, content generation, and judgement.

## Architecture

See `docs/architecture/Overview.md` for the full architecture, or `CLAUDE.md` for the implementation-level guide.

## Development

```bash
npm run build          # Compile TypeScript
npm test               # Run tests
npm run dev            # Start REPL
npm run dev -- --no-review  # Skip security review (dev only)
```

## Adding [*Script*](docs/dictionary.md)

Drop `.sh` files in `src/instance/scripts/` with frontmatter headers:

```bash
#!/bin/bash
# @name my-script
# @description What this script does
# @param PARAM_NAME Description of the parameter
```

*Script*s are automatically discovered and available to the planner.
