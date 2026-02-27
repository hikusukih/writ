# *BIG_BROTHER*

An **action agent** that makes a single LLM call — not a general-purpose agent. Triggered by [*Reviewer-Reviewer*](../../../dictionary.md) flags. Responsible for updating the flagged reviewer's and/or agent's configuration to address the constitutional inconsistency identified by the RR. This is the mechanism by which reviewers improve within an instance.

*BIG_BROTHER* does not have general file access. It receives specific file contents as inputs and produces updated text as output. It cannot write files directly — *BIG_BROTHER*-Reviewer approves output before anything is written to disk.

## Function Structure

> See [Overview: What "Agent" Means Here](../Overview.md#what-agent-means-here) for the general pattern.

**The function** (a script, not a general-purpose agent function): Receives specific file contents as parameters. Builds a single LLM prompt from identity docs + *BIG_BROTHER*-Agent.md + the flagged configs + the violation summary. Makes one LLM call. Returns proposed updated text. The function does not write files — it returns text that *BIG_BROTHER*-Reviewer must approve before anything is written to disk. Once approved, the [*Agent*](../../../dictionary.md)' text is updated.

**BIG_BROTHER-Agent.md should contain**: How to diagnose constitutional inconsistencies from a generalized violation summary, how to write improved reviewer/agent instructions, what constitutes a meaningful improvement vs. a superficial rewording. Editable via the self-modification loop (below), but the script code itself is not agent-editable.

**Caller provides** (infrastructure, triggered by RR flag): The five specific inputs listed below — and nothing else. The function's parameter list is the enforcement mechanism for input scoping.

## Qualities

- **Editable by agents during runtime**: Yes — its LLM prompt/config (*BIG_BROTHER*-Agent.md) is editable via the self-modification loop below. The script itself is not editable by agents.
- **Inputs** (exhaustive — nothing else passes in):
    - Flagged reviewer's XYZ-REVIEWER.md (current text)
    - Flagged agent's XYZ-AGENT.md (current text)
    - Violation summary from *Reviewer-Reviewer* (generalized — no task content; see [RR Generalization Requirement](ReviewerReviewer.md#generalization-requirement))
    - SOUL.md
    - CONSTITUTION.md
- **Explicitly excluded**: Any content from the task that triggered the original review. This is structural, not a guideline — the script does not accept task input as a parameter.
- **Outputs**: Proposed updated text for reviewer config, agent config, or both. Not a file write — text only. *BIG_BROTHER*-Reviewer approves before files are updated.
- **Class-specific reviewer**: *BIG_BROTHER*-Reviewer

## Single LLM Call

*BIG_BROTHER* receives both the reviewer config and the agent config in one call and produces updated text for one or both. *BIG_BROTHER*-Reviewer checks both outputs atomically.

## Self-Modification Loop

If *BIG_BROTHER*-Reviewer flags *BIG_BROTHER*'s output:
1. *BIG_BROTHER* may update its own *BIG_BROTHER*-Agent.md
2. The self-update goes to *BIG_BROTHER*-Reviewer for review
3. Only after successful review does the new configuration take effect
4. *BIG_BROTHER* retries the original edit with the updated config
5. **Hard cap**: 3 rounds maximum
6. **Failure case**: After 3 failed rounds, surface to user — this indicates a fundamental problem requiring human intervention
