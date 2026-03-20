import { z } from "zod";
export const InstructionStepSchema = z.object({
    scriptId: z.string(),
    params: z.record(z.string(), z.string()),
    order: z.number().int().nonnegative(),
});
export const InstructionFileSchema = z.object({
    planId: z.string(),
    steps: z.array(InstructionStepSchema),
});
export const AgentRegistryEntrySchema = z.object({
    id: z.string(),
    name: z.string(),
    class: z.enum(["os", "planner", "action"]),
    configFile: z.string(),
    permissions: z.object({
        canRead: z.array(z.string()),
        canWrite: z.array(z.string()),
    }),
});
export const AgentRegistrySchema = z.object({
    agents: z.array(AgentRegistryEntrySchema),
});
export const AgentOutputSchema = z.object({
    content: z.string(),
    thought: z.string().optional(),
    usage: z.object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
    }),
});
export const PlanStepSchema = z.object({
    description: z.string(),
    scriptId: z.string().optional(),
    missingReason: z.string().optional(),
    params: z.record(z.string(), z.string()).optional(),
    order: z.number().int().nonnegative(),
});
export const WorkAssignmentSchema = z.object({
    id: z.string(),
    description: z.string(),
    context: z.string().optional(),
    constraints: z.array(z.string()).optional(),
});
export const PlanSchema = z.object({
    id: z.string(),
    description: z.string(),
    steps: z.array(PlanStepSchema),
});
export const StrategicPlanSchema = z.object({
    id: z.string(),
    description: z.string(),
    assignments: z.array(WorkAssignmentSchema),
});
export const MessageParamSchema = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
});
export const SessionSchema = z.array(MessageParamSchema);
export const ReviewDecisionSchema = z.enum([
    "allow",
    "flag-and-halt",
    "flag-and-continue",
    "request-modifications",
    "fafc",
]);
export const ScriptInfoSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    params: z.array(z.string()),
    path: z.string(),
});
export const DeveloperWriterRequestSchema = z.object({
    capability: z.string(),
    existingScripts: z.array(ScriptInfoSchema),
    context: z.string().optional(),
});
export const DeveloperWriterResultSchema = z.object({
    scriptContent: z.string(),
    scriptName: z.string(),
    testSuggestions: z.string().optional(),
});
export const ReviewLogEntrySchema = z.object({
    timestamp: z.string(),
    subjectAgentId: z.string(),
    decision: ReviewDecisionSchema,
    reasoning: z.string(),
    reviewerType: z.enum(["rule", "llm"]),
    contentHash: z.string(),
});
export const RRInputSchema = z.object({
    reviewLogEntry: ReviewLogEntrySchema,
    soul: z.string(),
    constitution: z.string(),
});
export const RROutputSchema = z.object({
    consistent: z.boolean(),
    override: ReviewDecisionSchema.nullish().transform((v) => v ?? undefined),
    violationSummary: z.string().nullish().transform((v) => v ?? undefined),
});
export const ViolationSummarySchema = z.object({
    violatedPrinciple: z.string(),
    errorClass: z.string(),
    affectedAgentId: z.string(),
    affectedReviewerId: z.string().optional(),
});
export const BBInputSchema = z.object({
    violation: ViolationSummarySchema,
    agentConfig: z.string(),
    reviewerConfig: z.string().optional(),
    soul: z.string(),
    constitution: z.string(),
});
export const BBOutputSchema = z.object({
    updatedAgentConfig: z.string().nullish().transform((v) => v ?? undefined),
    updatedReviewerConfig: z.string().nullish().transform((v) => v ?? undefined),
    changeRationale: z.string(),
});
export const SemanticReviewResultSchema = z.object({
    approved: z.boolean(),
    concerns: z.array(z.string()).optional(),
    planAlignment: z.enum(["aligned", "divergent", "unclear"]),
});
export const JobTypeSchema = z.enum([
    "execute_script",
    "develop_script",
    "plan",
    "notify_user",
    "replan",
    "initiative_setup",
]);
export const JobStatusSchema = z.enum([
    "pending",
    "blocked",
    "running",
    "completed",
    "failed",
]);
export const CallbackActionSchema = z.enum([
    "create_job",
    "notify_orchestrator",
    "notify_planner",
    "update_initiative",
]);
export const CallbackSchema = z.object({
    on: z.enum(["complete", "fail"]),
    action: CallbackActionSchema,
    payload: z.record(z.string(), z.unknown()).optional(),
});
export const StatementRefSchema = z.object({
    statementId: z.string(),
    relationship: z.enum(["motivates", "constrains", "supersedes_prior"]),
});
export const JobSchema = z.object({
    id: z.string(),
    type: JobTypeSchema,
    status: JobStatusSchema,
    goal: z.string(),
    dependsOn: z.array(z.string()),
    createdBy: z.string(),
    plan: PlanSchema.nullish(),
    result: z.unknown().optional(),
    evidence: z.array(StatementRefSchema),
    callbacks: z.array(CallbackSchema),
    channel: z.array(z.string()),
    timestamps: z.object({
        created: z.string(),
        started: z.string().optional(),
        completed: z.string().optional(),
    }),
});
export const ReviewerResponseSchema = z.object({
    decision: ReviewDecisionSchema,
    reasoning: z.string(),
    modifications: z.string().optional(),
    summary: z.string().optional(),
});
