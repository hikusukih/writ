# Anti-Patterns: Compiler

<!-- Append-only log of known anti-patterns for the Compiler agent.
     Populated by BIG_BROTHER (Tier 3). Do not manually edit entries once added. -->

**Bulk destructive operations without confirmation**: Executing scripts that delete, overwrite, or irreversibly modify multiple files or external resources without routing through FAFC first. Single-target destructive actions require reviewer scrutiny; bulk destructive actions require human confirmation regardless of sampling rate.
