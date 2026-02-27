# Gitea Integration

## Summary
Gitea embedded in the AgentOS container, hosting the script repository. A port is exposed so the human operator can inspect scripts, history, and PRs via browser without SSH access. Agents interact with Gitea via its API for branch and PR operations.

## Motivation
Scripts are the system's growing capability surface. As Developer/Writer produces new scripts and the branch workflow matures, the human needs a low-friction way to inspect what the system has built. Gitea provides this without requiring terminal access or an external service.

## Design Notes
**VCS as swappable infrastructure**: The stable contract is the branch→review→merge interface, not Gitea specifically. AgentOS could swap the underlying VCS later. Agent interactions should go through an abstraction layer (scripts or a thin client) rather than hardcoding Gitea API calls throughout.

**Exposed port**: Gitea web UI accessible from the host network. The operator can browse the script repo, review PRs, and inspect history from a browser.

**Agent access**: Agents interact via the Gitea API — creating branches, opening PRs, reading review comments. This is mediated through scripts in the script index, consistent with "everything is a script."

**Relationship to web dashboard**: The dashboard links out to Gitea for script history and PR review rather than duplicating that functionality. Gitea is the source of truth for script provenance.

## Open Questions
- Gitea initialization: how is the script repo created and seeded on first run?
- Authentication model: how do agents authenticate to the Gitea API? Token stored where?
- Is the Gitea admin UI exposed, or just the repo browser?
- Backup/restore: Gitea data as a persistent volume — what's the recovery model?
- Lighter alternatives worth evaluating: Soft Serve (Charmbracelet), Gogs. Both are smaller than Gitea. Soft Serve is terminal-first, which fits the project aesthetic but sacrifices the browser UI.

## Dependencies
Containerization

## Unlocks
Script Branch Workflow + Code-Reviewing-Agent, human script inspection.
