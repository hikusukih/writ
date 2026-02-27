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
    params: z.record(z.string(), z.string()).optional(),
    order: z.number().int().nonnegative(),
});
export const PlanSchema = z.object({
    id: z.string(),
    description: z.string(),
    steps: z.array(PlanStepSchema),
});
