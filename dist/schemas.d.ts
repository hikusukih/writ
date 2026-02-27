import { z } from "zod";
export declare const InstructionStepSchema: z.ZodObject<{
    scriptId: z.ZodString;
    params: z.ZodRecord<z.ZodString, z.ZodString>;
    order: z.ZodNumber;
}, z.core.$strip>;
export declare const InstructionFileSchema: z.ZodObject<{
    planId: z.ZodString;
    steps: z.ZodArray<z.ZodObject<{
        scriptId: z.ZodString;
        params: z.ZodRecord<z.ZodString, z.ZodString>;
        order: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const AgentRegistryEntrySchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    class: z.ZodEnum<{
        os: "os";
        planner: "planner";
        action: "action";
    }>;
    configFile: z.ZodString;
    permissions: z.ZodObject<{
        canRead: z.ZodArray<z.ZodString>;
        canWrite: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const AgentRegistrySchema: z.ZodObject<{
    agents: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        class: z.ZodEnum<{
            os: "os";
            planner: "planner";
            action: "action";
        }>;
        configFile: z.ZodString;
        permissions: z.ZodObject<{
            canRead: z.ZodArray<z.ZodString>;
            canWrite: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const AgentOutputSchema: z.ZodObject<{
    content: z.ZodString;
    thought: z.ZodOptional<z.ZodString>;
    usage: z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const PlanStepSchema: z.ZodObject<{
    description: z.ZodString;
    scriptId: z.ZodOptional<z.ZodString>;
    params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    order: z.ZodNumber;
}, z.core.$strip>;
export declare const PlanSchema: z.ZodObject<{
    id: z.ZodString;
    description: z.ZodString;
    steps: z.ZodArray<z.ZodObject<{
        description: z.ZodString;
        scriptId: z.ZodOptional<z.ZodString>;
        params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        order: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
