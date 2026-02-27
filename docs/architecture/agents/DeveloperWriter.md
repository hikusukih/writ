# Developer/Writer

Author of scripts that the [*AgentOS*](../../../dictionary.md) can use moving forward. Codifies solutions, documents their I/O. extends the *AgentOS*. This allows future calls to choose a known quantity of a path, which is easier to vet than LLM output, and - **importantly** - testable, if not deterministic.

## Function Structure

> See [Overview: What "Agent" Means Here](../Overview.md#what-agent-means-here) for the general pattern.

**The function**: Receives a task requirement (from a planner) describing a capability gap. Reads the script index directly to understand existing capabilities. Builds a prompt from identity docs + Developer-Writer-Agent.md + the requirement + the script index. Calls LLM to produce a script with tests and documentation. Validates the output (frontmatter present, tests runnable). Returns the script for review by Developer-[*Reviewer*](../../../dictionary.md) before it's added to the script index.

**Developer-Writer-Agent.md should contain**: Coding standards, testing requirements, how to scope scripts narrowly, documentation conventions (frontmatter format, I/O descriptions, side effect declarations), how to parameterize for reuse without over-generalizing.

**Caller provides** (Lieutenant [*Planner*](../../../dictionary.md), via mediated invocation): The specific capability gap — what the script needs to do, what inputs it will receive, what outputs are expected. The Developer/Writer reads the script index directly to avoid duplicating existing capabilities.

## Qualities

- **Editable by agents during runtime**: Yes
- **Inputs**:
    - PLANXYZ.MD task requirements
    - Current list of capabilities/scripts/skills (see [Terminology](../../planning/OpenQuestions.md#meta-terminology))
- **Outputs**: Versioned scripts with tests and documentation
- **Class-specific reviewer**: Developer-Reviewer ([Review Interface](ReviewInterface.md) implementation)

## Responsibilities

- Tasked by a *Planner* to fill a requirement from the PLANXYZ.MD for a single task
- Write repeatable executable scripts with tests
- Aim for them to be specific to the task, but parameterized for future similar calls
- Write docs of inputs, outputs, side effects, etc.
- Scope the script to its purpose - asked to make a curl wrapper? Fine, but force GET. Need a POST later? Requires a different script, different review process, with its own different side effect scope in the docs.
- [*Script*](../../../dictionary.md) are all versioned in a git repo
- User is encouraged to view them periodically. Maybe Developer-*Reviewer* does so periodically as well.
- **Junior-level task granularity**: Each script should do one thing that a level a junior developer could understand and verify. If the script is too complex to explain simply, it should be split.
