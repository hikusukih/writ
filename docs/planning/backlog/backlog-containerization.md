# Containerization

## Summary
AgentOS ships as a self-contained deployable container. All internal services — Gitea, script runner, logs, dashboard — run inside it. A user deploys one container and gets a fully functional instance.

## Motivation
The "agent as a self-expanding OS" analogy implies a deployable unit, not a manual install process. Containerization is what makes Writ an artifact you hand someone rather than a setup procedure. It's also the prerequisite for Gitea and the web dashboard running inside the instance boundary.

## Design Notes
Internal services (Gitea, etc.) are embedded rather than sidecars — consistent with the project philosophy of self-containment. The instance could conceivably swap internal services later; the stable boundary is the container's external interface, not which software runs inside.

Ports exposed to the host: at minimum, the web dashboard and Gitea UI. The IOAdapter HTTP endpoint (if implemented) would also be exposed.

Script execution permissions: scripts run as a dedicated user created during container setup, not root. Elevation model (for scripts that need it) needs to be defined in this context — the host sudoers model doesn't translate directly into a container.

## Open Questions
- Base image choice
- How does the dedicated script-runner user get created and scoped during container build?
- Elevation model for scripts requiring root inside the container
- Persistent volume strategy: what data survives container replacement? (logs, job state, identity files, Gitea repos)
- Update model: how does the container get updated without losing instance state?
- Single-container vs. compose: embedded services as processes vs. a minimal compose file. Single container is more portable; compose is easier to develop and maintain.

## Dependencies
None — this is infrastructure.

## Unlocks
Gitea Integration, Web Dashboard, production deployment.
