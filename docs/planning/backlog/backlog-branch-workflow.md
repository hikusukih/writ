# Script Branch Workflow + Code-Reviewing-Agent

## Summary
Scripts are developed on branches and merged to main only after a PR review. A Code-Reviewing-Agent participates in the review before merge, providing quality and correctness assessment. Formalizes script promotion with an accountable audit trail accessible via terminal and Gitea web UI.

## Motivation
Once Developer/Writer is live and producing scripts, there needs to be a gate before those scripts enter the active index. The current model (Developer-Reviewer approves, script is added) is a single synchronous check. A branch + PR model adds a visible, human-inspectable review record and a natural point for the Code-Reviewing-Agent to participate. It also makes the system's development activity legible to the human operator without requiring them to monitor logs.

## Design Notes
**Code-Reviewing-Agent is distinct from the Reviewer class**: Reviewers are constitutional/security gatekeepers. The Code-Reviewing-Agent is a quality and correctness reviewer — does this script do what it claims? Is it scoped appropriately? Are the side effects documented accurately? Different concern, different agent.

**Workflow sketch**:
1. Developer/Writer produces a script on a feature branch
2. Developer-Reviewer approves the script (existing security/constitutional check)
3. Code-Reviewing-Agent opens or reviews a PR on the Gitea repo
4. Code-Reviewing-Agent leaves review comments, approves or requests changes
5. On approval, script merges to main and enters the active script index

**Human override**: The human operator can review and merge (or close) any PR via the Gitea UI. The agent review is not the only path to merge.

**Dogfooding note**: Switching to a branch workflow for Writ's own development (before this feature is built) is worthwhile — it makes the workflow concrete and surfaces any friction before agents have to deal with it.

## Open Questions
- Is Code-Reviewing-Agent a new agent class or a specialized mode of Developer-Reviewer?
- How does LLM-backed review interact with Gitea's PR comment model? Does the agent post comments directly via API, or produce a review summary that gets posted?
- Does this replace or supplement the existing Developer/Writer + Developer-Reviewer pipeline, or does Developer-Reviewer become a pre-PR check and Code-Reviewing-Agent is the PR review?
- Who can merge? Agent only, human only, or either?
- What happens if Code-Reviewing-Agent requests changes and Developer/Writer doesn't address them?

## Dependencies
Gitea Integration

## Unlocks
Reliable script provenance, agent participation in code review, human visibility into system development activity.
