# Model Management

## Purpose

Select the cheapest competent model for each task type, and track model quality over time. External models change without notice — a model that was great last month may regress or improve. The system needs to detect this and adapt.

This is especially critical for non-deterministic tasks (content generation, prompt engineering, creative work) where there is no shell script to call and model capability *is* the capability. For deterministic script execution, model choice matters less.

## Core Concepts

### Model Router

A component that maintains performance profiles per model per task category. When a task is dispatched, the router selects the best model based on historical performance data, cost, and availability.

- Tracks model name, provider, and version
- Multiple versions of the same model can be compared
- Falls back gracefully when a preferred model is unavailable

### A/B Testing Framework

Systematic comparison of models on equivalent tasks:

- Tasks are categorized (e.g., code generation, content writing, planning, review)
- For each category, the system periodically routes equivalent tasks to different models
- Results are evaluated (by reviewers, by humans, or by outcome metrics) and recorded
- Over time, the router converges on the best model per category — but continues sampling alternatives to detect drift

### Performance Tracking

- Per-model, per-task-category success rates
- Cost per task (token usage, API cost)
- Latency
- Historical trends — detect regressions in external models that update silently
- Human override feedback ("this model's output was bad, use the other one")

### Model Registry

A persistent record of:

- Available models (local and API-based)
- Per-model configuration (endpoint, auth, token limits, cost)
- Performance history organized by task category
- Current routing preferences

## Design Philosophy

The system should be designed to swap in lighter and smarter models as LLM technology improves. The model management layer is the mechanism for realizing that benefit — without it, model improvements require manual reconfiguration.

This module is its own project-scale effort and a significant undertaking. See [docs/planning/Roadmap.md](../planning/Roadmap.md) for phase placement.

## Integration Points

- **Planners** request tasks; the model router selects which model fulfills them
- **Reviewers** evaluate output quality, feeding data back to the router
- **Adjutant** manages model availability (local model updates, API key rotation)
- **Meta-tier analysis** uses model performance data to inform cross-instance improvements

## Open Questions

- How granular should task categories be?
- Should the router optimize for cost, quality, or a configurable blend?
- How do we handle models that are best at a task but prohibitively expensive?
- What's the minimum sample size before the router trusts a model's performance profile?
