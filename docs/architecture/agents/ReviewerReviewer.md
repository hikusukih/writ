# *Reviewer-Reviewer* ([*OS Class*](../../../dictionary.md), Single Instance)

The *Reviewer-Reviewer* is a singleton *OS Class* agent that audits reviewer decisions by sampling. It does not review every decision synchronously — it samples from the stream of reviewer decisions and rates them.

**Agent Class**: OS Class (foundational, immutable by [*Agent*](../../../dictionary.md) at runtime)

## Function Structure

> See [Overview: What "Agent" Means Here](../Overview.md#what-agent-means-here) for the general pattern.

**The function**: Samples from the stream of reviewer decisions. For each sample, builds a prompt from identity docs + RR's config + the sampled decision. Calls LLM to rate constitutional consistency. Returns a rating and, when inconsistency is found, an override flag plus a generalized violation summary for [*BIG_BROTHER*](../../../dictionary.md). The function also handles triggering *BIG_BROTHER* and logging.

**Reviewer-Reviewer config (immutable — *OS Class*)**: How to evaluate constitutional consistency, what threshold separates "acceptable variation" from "constitutional violation," how to write generalized violation summaries that describe error classes without leaking task content. This config is not editable by agents at runtime.

**Caller provides** (infrastructure, sampling mechanism): A reviewer decision to audit — the reviewer's output, the decision it made, and enough context to evaluate whether the decision was constitutionally consistent. Explicitly excludes raw task content to prevent injection into the oversight chain.

## Scope

Rate whether the sampled reviewer decision is consistent with [*Constitution*](../../../dictionary.md) and [*Soul*](../../../dictionary.md). The RR does not evaluate whether the underlying task decision was correct (it has no more information about the task than the reviewer did). Post-hoc correctness evaluation is the domain of the meta-tier process.

## When the RR Flags a Decision

An RR flag is authoritative and overrides the reviewer's decision. It:
1. Overrides the reviewer's original decision
2. Signals the subject agent to start from scratch
3. Triggers the [*BIG_BROTHER*](BigBrother.md) script to update the reviewer's config based on the nature of the constitutional inconsistency. For every negative example it should write at least one positive "should have" action.
4. Logs the flag, the reviewer's original decision, and the RR's reasoning for meta-tier analysis

## Generalization Requirement

When summarizing a reviewer failure for *BIG_BROTHER*, the RR must describe the pattern of the failure in terms of CONSTITUTION.md principles. It must not quote or reconstruct task content, user input, or agent output from the reviewed interaction. The summary must be generalizable — it describes a class of error, not a specific instance.

This is structural: task content must not leak into *BIG_BROTHER*'s context through the RR summary.

## Qualities

- **Editable by agents during runtime**: No (*OS Class*)
- **Inputs**: Sampled reviewer decisions, *Constitution*, *Soul*, *but not* input from the task in case of injection
- **Outputs**: Ratings of reviewer consistency, override flags (to subject agent + [*BIG_BROTHER*](BigBrother.md))
