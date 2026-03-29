# Writ: A Security-First Redesign of Locally-Deployed Multi-Agent Systems

*A capstone reflection on an exploratory project.*

---

## The Problem

Locally-deployed multi-agent systems are a compelling idea in an uncomfortable position. The promise is real: give an LLM persistent access to a local shell, a curated set of scripts, and the ability to extend itself, and you have something genuinely useful — a personal assistant that can do work, remember preferences, and grow more capable over time. OpenClaw demonstrated this pattern. It also demonstrated how badly wrong it can go.

The structural problems in naive agentic systems are not subtle:

**Unrestricted execution.** When LLM output flows directly into shell execution, every mistake — hallucination, manipulation, or misunderstanding — becomes an action with real side effects. The model's confidence is indistinguishable from correctness until something breaks.

**No audit trail.** Without append-only logs of what happened and why, there is no way to reconstruct the chain of events that led to a bad outcome, identify patterns across runs, or hold the system accountable.

**Unbounded self-modification.** A system that can rewrite any of its own files can be induced to rewrite the files that govern its own behavior. This is the worst kind of attack surface: it inverts the trust model entirely.

**Prompt injection as a constant.** An agent that reads external content — web pages, documents, API responses — will encounter text designed to hijack its reasoning. This is not an edge case. For any useful personal assistant, it is the default operating condition.

**No separation of concerns.** When one agent orchestrates, plans, executes, and reviews its own output, there is no independent check on any decision. The system is as trustworthy as its least careful moment.

These are not implementation bugs. They are structural properties of systems that give LLMs direct access to execution without an intervening discipline.

---

## The Writ Approach

Writ's core thesis is that **LLMs provide judgment; functions provide execution**. LLM-backed agents decide what to do. Deterministic code does everything else. LLM output never directly triggers side effects — it always passes through a reviewer and a deterministic translation step before anything runs.

This separation is implemented through a layered pipeline:

```
User input
  → Orchestrator (interprets intent, creates job DAG)
  → General Planner (partitions work into assignments)
  → Lieutenant Planner (per assignment: detailed, script-level plan)
    → Developer/Writer (if missing scripts: generate → review → promote)
  → Executor (maps plan to instruction JSON)
  → Compiler (validates + composes + runs scripts)
  → Results collected
  → Orchestrator (synthesizes natural-language response)
```

At each stage, output is intercepted by a dedicated LLM-backed reviewer before it proceeds. The reviewer is specialized to its subject agent's function and has context about what that agent is supposed to do. Reviewer output is one of four decisions: Allow, Flag-and-Continue, Request Modifications, or Flag-and-Force-Confirmation (FAFC) — which surfaces to the user for explicit approval.

Several design decisions are worth examining individually:

### The Compiler as Execution Boundary

The Compiler is the most important structural element. It is a static, deterministic function — not LLM-backed, not editable by agents. It takes validated instruction JSON (a list of script IDs with parameters), verifies that the referenced scripts exist and that their parameter signatures match, composes a shell script, and runs it. By the time the Compiler sees instruction JSON, trust has been established at least twice: the Executor's reviewer approved the instructions, and the referenced scripts are already in the vetted local repository.

This means: a compromised or manipulated LLM can produce bad text. It cannot directly cause bad actions. The worst it can do is produce instruction JSON that the Compiler will reject, or that a reviewer will catch. The blast radius is contained to the review chain.

### Scoped Context and Agent Specialization

Each agent sees only the context relevant to its role. The Orchestrator sees user intent and high-level task framing. The Lieutenant Planner sees a specific work assignment and the available script index. The Executor sees a detailed plan. No single agent has the full picture.

This limits the value of a single injection attack. An attacker who compromises the context flowing into the Lieutenant Planner cannot, through that channel alone, affect the Orchestrator's intent interpretation or the Compiler's structural validation. They would need to compromise multiple independent stages — each with its own reviewer — simultaneously.

### BIG_BROTHER and the Self-Improvement Loop

Writ is designed to improve within an instance, not just across versions. The Reviewer-Reviewer (RR) samples recent review decisions and audits them for constitutional consistency. When it identifies an inconsistency — a reviewer that approved something it shouldn't have, or rejected something it should have allowed — it triggers BIG_BROTHER.

BIG_BROTHER makes a single LLM call with carefully scoped inputs: the flagged reviewer's config, the flagged agent's config, the violation summary, and the system's SOUL.md and CONSTITUTION.md. Critically, it receives **no content from the task that triggered the original review**. This is structural: the function's parameter list does not accept task input. BIG_BROTHER cannot be fed a carefully crafted task description to influence how it rewrites reviewer configurations.

The self-modification loop has a hard cap of three rounds. If three iterations cannot produce an approved configuration update, the system surfaces to the user. This is the correct failure mode: it acknowledges that some problems require human intervention, rather than looping indefinitely.

### Identity Files as the Narrow Self-Modification Surface

The only files agents can modify at runtime are the identity files under `src/instance/identity/`: per-agent configuration files and anti-pattern lists. The deterministic code — the functions that implement agent logic, validation, and execution — is not agent-editable. A compromised XYZ-AGENT.md can degrade an agent's judgment; it cannot change what the function *does* with the output. Validation, review, and the Compiler are all in the deterministic layer.

Writes to identity files use atomic `.pending` → rename with backups, so a crash mid-update leaves a `.pending` artifact rather than a corrupted config.

---

## The Script-as-Capability Model and the Linux Analogy

The deeper analogy motivating Writ is the operating system. Linux is a collection of files with different permissions, maintained by different authors, customizable by users who take the basic set and extend it for their purposes. An OS-oriented approach to agent systems would maintain a repository of vetted scripts — each documented, each with explicit parameter contracts, each with known side effects — that agents can select from to accomplish work.

This has an interesting implication for tool selection. A well-curated script index is not just a list of capabilities. It is also a declaration of scope. Each script's `@description` and `@param` headers describe not just what the script does but what it *cannot* do — because it has been written to do exactly one thing, with exactly the parameters it declares.

Compare this to raw shell access. `rm` can delete anything on the filesystem. `rm-project-artifacts.sh` — a script that removes build artifacts from a specific project directory — can only do what its implementation allows, and any attempt to pass it a path outside its expected scope will either fail or trigger a reviewer flag when the Compiler validates the parameter against the script's declared contract.

This points toward a specific and underexplored use case: **using a curated script index as a mechanism for selecting a safe, well-scoped subset of Linux system capabilities, and surfacing to the model which operations require strict parameter scoping to avoid unintended consequences.** Rather than letting the model reason from first principles about whether `find / -name "*.log" -delete` is safe, the model reasons about whether `rotate-logs.sh` serves its purpose — a much narrower question with a much clearer answer.

The script index, in this framing, is a security primitive as much as a convenience primitive.

---

## Open Questions

### Can this approach actually mitigate prompt injection?

Honestly: partially, and with caveats.

The structural mitigations are real. Scoped context limits what injected content can influence. The Compiler's structural validation is immune to LLM persuasion. BIG_BROTHER's input scoping prevents task-content from influencing self-improvement. These are meaningful constraints.

But they are not complete. An injection attack that successfully manipulates the Lieutenant Planner can produce a plan that references valid scripts with valid-looking parameters that accomplish something unintended. The Executor-Reviewer is supposed to catch semantic gaps between stated intent and actual instruction JSON — but this is an LLM call, and LLMs can be persuaded. The pre-execution semantic review gate (which checks the composed shell script against the original plan intent, after Compiler validation but before execution) is the last line of defense, and it is currently stubbed.

The deeper problem is that prompt injection is fundamentally a problem of untrusted input entering a trusted reasoning channel. Writ's architecture limits the blast radius of a successful injection — it cannot directly execute arbitrary commands — but it does not prevent the injection from influencing the plan. A sufficiently sophisticated injection that looks like legitimate task context, and that survives multiple review stages, can still cause harm. The review chain is only as good as the reviewers, and the reviewers are LLMs.

What Writ does more clearly than it mitigates injection is **contain it**. A bad plan gets stopped at the Compiler or flagged by a reviewer. A bad reviewer decision gets audited by the RR. A compromised agent config gets capped at three self-modification rounds. The system fails noisily and auditably, rather than silently and catastrophically. That is a meaningful improvement over naive architectures, even if it is not a security guarantee.

### Is it cost-effective?

The cost picture is genuinely unclear, and this is probably the most practically important open question.

Writ's pipeline involves multiple sequential LLM calls per user request: Orchestrator interpretation, General Planner, Lieutenant Planner, Executor, and then a parallel review call at each stage. The self-improvement loop adds RR sampling and occasional BIG_BROTHER calls. For a simple task — "list files in this directory" — this is absurd overhead.

There are structural answers to this: sampling-rate decay reduces review frequency for agents with clean records; lighter models are appropriate for lower-ambiguity calls (Executor, simple General Planner tasks); local model providers (Ollama) can reduce API dependency for routine calls. But the fundamental tension is that a security-first architecture is necessarily more expensive than a naive one, because security costs are paid in redundant checks.

The cost question is also a design question about what the system is for. If the goal is to automate high-frequency, low-stakes operations, the overhead is probably unjustifiable. If the goal is to safely automate lower-frequency, higher-stakes operations — where getting it wrong has real consequences — the cost of a few extra LLM calls may be entirely reasonable. Writ's design implicitly assumes the latter. Whether that assumption holds in practice has not been tested at scale.

There is also a trajectory argument: local model quality is improving. The architecture is designed with model-agnosticism as an explicit goal. As smaller, locally-hosted models become capable enough for Executor and planning calls, the recurring API cost approaches zero. The review chain then becomes a fixed infrastructure cost, not a per-request variable cost.

### Is this duplicative of well-designed agent tool-use?

This is the sharpest challenge to Writ's design, and it deserves a direct answer.

Modern LLM APIs provide tool-use: structured function definitions that the model can call, with parameters validated by the platform. A well-designed tool-use implementation gives the model a curated set of functions, enforces parameter types, and prevents arbitrary code execution. Is Writ's script-as-capability model just a more complicated version of this?

In some ways, yes. The script index with `@name`/`@description`/`@param` frontmatter is functionally similar to an OpenAI function definition. The Compiler's structural validation is similar to what an API-level tool-use implementation does automatically. If you are building an agent using a modern API, you probably get a version of this for free.

What Writ adds over standard tool-use:

**Local deployment and local scripts.** Tool-use APIs are designed for cloud-hosted functions. Writ's model is specifically designed for agents that have persistent access to a local filesystem and shell — a context where tool-use APIs either don't apply or provide much weaker guarantees.

**The review chain as a compositional safety layer.** Standard tool-use validates parameters and executes functions. It does not evaluate whether the combination of function calls accomplishes what the user intended, whether the plan is constitutionally consistent, or whether a reviewer with knowledge of the agent's role would flag this output. The review chain is adding judgment, not just validation.

**Self-improvement within an instance.** Standard tool-use has no mechanism for the agent's behavioral configuration to improve in response to observed errors. BIG_BROTHER, RR, and the anti-pattern learning loop are genuine additions — the system can get better at catching its own mistakes without a human rewriting prompts.

**Auditability.** Append-only JSONL logs of every agent invocation, review decision, and script execution give Writ a much richer audit trail than standard tool-use APIs provide. For high-stakes or regulated use cases, this matters.

The honest answer is that Writ's architecture is most valuable in the gap between "standard tool-use API" (which handles the easy cases well) and "unrestricted shell access" (which handles everything badly). It is not a replacement for well-designed tool-use; it is an extension of the same principles into a harder problem domain.

---

## Emerging Direction: Script Indexes as Scoping Primitives

The most interesting design direction to emerge from this project is one that wasn't the original focus: using a curated script index not just as a capability catalog but as a **tool selection discipline** for the model.

The observation is this: one of the hardest problems in giving a model access to a Linux system is helping it reason about which operations are safe to run with which parameters. `sed`, `awk`, `find`, `xargs` — these are powerful, composable, and capable of significant unintended damage when parameterized incorrectly. A model asked to "clean up old log files" might reason its way to a perfectly valid-looking command that, due to a subtle parameter error, removes something it shouldn't.

A well-maintained script index inverts this problem. Instead of asking the model to reason from first principles about shell safety, you ask it to select from a set of pre-vetted scripts with explicit, narrow contracts. The model's job becomes: "which of these scripts serves my purpose, and what parameters does it need?" — a much more tractable question.

But there's a further refinement: a script index could explicitly annotate which operations require strict scoping to avoid unintended consequences. Something like:

```bash
# @name delete-build-artifacts
# @description Remove build artifacts from the project's dist/ directory
# @scope-warning Scoped to dist/ only; never accepts paths outside project root
# @param TARGET_DIR Directory under dist/ to clean (required)
```

This annotation serves two purposes: it tells the model which scripts carry elevated risk (and therefore warrant a reviewer flag if used with unusual parameters), and it creates a vocabulary for the review chain to reason about scope violations without requiring the reviewer to independently evaluate the safety of arbitrary shell commands.

Over time, a community-maintained index of vetted scripts — analogous to a package registry, but with security properties as first-class metadata — could provide the same kind of accumulated expertise that Linux's ecosystem of vetted tools provides, but for the specific context of LLM-driven automation. The model doesn't need to know that `rm -rf /` is dangerous; it needs to know that `delete-build-artifacts.sh` is scoped to `dist/` and that any invocation asking it to operate outside that scope should trigger FAFC.

This is a long way from being implemented, but it points toward a concrete and tractable improvement: the script index as a structured vocabulary for communicating scope and safety constraints to the model, rather than a flat list of available capabilities.

---

## Limitations and Honest Assessment

Writ is an exploratory project. Several of its most important mechanisms are incomplete or stubbed:

- The pre-execution semantic review gate exists in code but is disabled by default, pending real flag patterns to calibrate against.
- The `request-modifications` reviewer decision is a valid return value but is not acted on — no re-call loop exists yet.
- Script sandboxing (running scripts in an isolated environment and noting external calls before execution) is described in the architecture but not implemented.
- The meta-tier process — analysis of review logs across instances to improve agent configs and anti-pattern lists — is entirely unaddressed.
- Supply chain verification for scripts (cryptographic signing, trusted repository provenance) is an open question.

The review chain is only as good as the reviewers, and the reviewers are LLMs that can be influenced. The system assumes that multiple independent LLM calls are harder to simultaneously manipulate than a single call — this is a reasonable bet, not a guarantee.

The cost model is untested at scale. The architecture makes the right trades for high-stakes, lower-frequency operations, but whether it is practical for general-purpose personal assistant use remains to be seen.

And there is the deeper question that motivates the whole project: whether locally-deployed, self-modifying agent systems are the right model at all, or whether the right answer is simply better-designed cloud-hosted tool-use with strong API-level guarantees. Writ's approach is most compelling in contexts where local deployment is required — sensitive data, offline use, cost constraints at scale — and less compelling where those constraints don't apply.

---

## Conclusion

Writ is an attempt to take seriously what it would mean to give an LLM durable, local, self-extending capabilities without also giving it the ability to cause arbitrary harm. The core architectural commitment — LLMs provide judgment, functions provide execution — is the right foundation. The review chain, the Compiler boundary, the scoped self-improvement loop, and the append-only audit trail are all genuine improvements over naive architectures.

The open questions are real. Prompt injection mitigation is partial, not complete. Cost-effectiveness is unproven at scale. The relationship to well-designed tool-use APIs is complementary rather than competitive, but the boundary is fuzzy. The script-index-as-scoping-primitive direction is promising but early.

What the project has demonstrated most clearly is that the security properties of a locally-deployed agent system can be reasoned about structurally — that there are architectural choices that contain blast radius, limit attack surface, and create auditable failure modes, independently of whether any individual LLM call is safe. That is a useful thing to know, and it is the foundation that further work should build on.

---

*This document reflects the state of the Writ project as of March 2026. Implementation status and design decisions are current as of that date.*
