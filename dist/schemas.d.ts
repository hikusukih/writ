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
    missingReason: z.ZodOptional<z.ZodString>;
    params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    order: z.ZodNumber;
}, z.core.$strip>;
export declare const WorkAssignmentSchema: z.ZodObject<{
    id: z.ZodString;
    description: z.ZodString;
    context: z.ZodOptional<z.ZodString>;
    constraints: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const PlanSchema: z.ZodObject<{
    id: z.ZodString;
    description: z.ZodString;
    steps: z.ZodArray<z.ZodObject<{
        description: z.ZodString;
        scriptId: z.ZodOptional<z.ZodString>;
        missingReason: z.ZodOptional<z.ZodString>;
        params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        order: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const StrategicPlanSchema: z.ZodObject<{
    id: z.ZodString;
    description: z.ZodString;
    assignments: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        description: z.ZodString;
        context: z.ZodOptional<z.ZodString>;
        constraints: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const MessageParamSchema: z.ZodObject<{
    role: z.ZodEnum<{
        user: "user";
        assistant: "assistant";
    }>;
    content: z.ZodString;
}, z.core.$strip>;
export declare const SessionSchema: z.ZodArray<z.ZodObject<{
    role: z.ZodEnum<{
        user: "user";
        assistant: "assistant";
    }>;
    content: z.ZodString;
}, z.core.$strip>>;
export declare const ReviewDecisionSchema: z.ZodEnum<{
    allow: "allow";
    "flag-and-halt": "flag-and-halt";
    "flag-and-continue": "flag-and-continue";
    "request-modifications": "request-modifications";
    fafc: "fafc";
}>;
export declare const ScriptInfoSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    params: z.ZodArray<z.ZodString>;
    path: z.ZodString;
}, z.core.$strip>;
export declare const DeveloperWriterRequestSchema: z.ZodObject<{
    capability: z.ZodString;
    existingScripts: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
        params: z.ZodArray<z.ZodString>;
        path: z.ZodString;
    }, z.core.$strip>>;
    context: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const DeveloperWriterResultSchema: z.ZodObject<{
    scriptContent: z.ZodString;
    scriptName: z.ZodString;
    testSuggestions: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const ReviewLogEntrySchema: z.ZodObject<{
    timestamp: z.ZodString;
    subjectAgentId: z.ZodString;
    decision: z.ZodEnum<{
        allow: "allow";
        "flag-and-halt": "flag-and-halt";
        "flag-and-continue": "flag-and-continue";
        "request-modifications": "request-modifications";
        fafc: "fafc";
    }>;
    reasoning: z.ZodString;
    reviewerType: z.ZodEnum<{
        rule: "rule";
        llm: "llm";
    }>;
    contentHash: z.ZodString;
}, z.core.$strip>;
export declare const RRInputSchema: z.ZodObject<{
    reviewLogEntry: z.ZodObject<{
        timestamp: z.ZodString;
        subjectAgentId: z.ZodString;
        decision: z.ZodEnum<{
            allow: "allow";
            "flag-and-halt": "flag-and-halt";
            "flag-and-continue": "flag-and-continue";
            "request-modifications": "request-modifications";
            fafc: "fafc";
        }>;
        reasoning: z.ZodString;
        reviewerType: z.ZodEnum<{
            rule: "rule";
            llm: "llm";
        }>;
        contentHash: z.ZodString;
    }, z.core.$strip>;
    soul: z.ZodString;
    constitution: z.ZodString;
}, z.core.$strip>;
export declare const RROutputSchema: z.ZodObject<{
    consistent: z.ZodBoolean;
    override: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodEnum<{
        allow: "allow";
        "flag-and-halt": "flag-and-halt";
        "flag-and-continue": "flag-and-continue";
        "request-modifications": "request-modifications";
        fafc: "fafc";
    }>>>, z.ZodTransform<"allow" | "flag-and-halt" | "flag-and-continue" | "request-modifications" | "fafc" | undefined, "allow" | "flag-and-halt" | "flag-and-continue" | "request-modifications" | "fafc" | null | undefined>>;
    violationSummary: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | undefined, string | null | undefined>>;
}, z.core.$strip>;
export declare const ViolationSummarySchema: z.ZodObject<{
    violatedPrinciple: z.ZodString;
    errorClass: z.ZodString;
    affectedAgentId: z.ZodString;
    affectedReviewerId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const BBInputSchema: z.ZodObject<{
    violation: z.ZodObject<{
        violatedPrinciple: z.ZodString;
        errorClass: z.ZodString;
        affectedAgentId: z.ZodString;
        affectedReviewerId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    agentConfig: z.ZodString;
    reviewerConfig: z.ZodOptional<z.ZodString>;
    soul: z.ZodString;
    constitution: z.ZodString;
}, z.core.$strip>;
export declare const BBOutputSchema: z.ZodObject<{
    updatedAgentConfig: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | undefined, string | null | undefined>>;
    updatedReviewerConfig: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | undefined, string | null | undefined>>;
    changeRationale: z.ZodString;
}, z.core.$strip>;
export declare const SemanticReviewResultSchema: z.ZodObject<{
    approved: z.ZodBoolean;
    concerns: z.ZodOptional<z.ZodArray<z.ZodString>>;
    planAlignment: z.ZodEnum<{
        aligned: "aligned";
        divergent: "divergent";
        unclear: "unclear";
    }>;
}, z.core.$strip>;
export declare const JobTypeSchema: z.ZodEnum<{
    execute_script: "execute_script";
    develop_script: "develop_script";
    plan: "plan";
    notify_user: "notify_user";
    replan: "replan";
    initiative_setup: "initiative_setup";
}>;
export declare const JobStatusSchema: z.ZodEnum<{
    pending: "pending";
    blocked: "blocked";
    running: "running";
    completed: "completed";
    failed: "failed";
}>;
export declare const CallbackActionSchema: z.ZodEnum<{
    create_job: "create_job";
    notify_orchestrator: "notify_orchestrator";
    notify_planner: "notify_planner";
    update_initiative: "update_initiative";
}>;
export declare const CallbackSchema: z.ZodObject<{
    on: z.ZodEnum<{
        complete: "complete";
        fail: "fail";
    }>;
    action: z.ZodEnum<{
        create_job: "create_job";
        notify_orchestrator: "notify_orchestrator";
        notify_planner: "notify_planner";
        update_initiative: "update_initiative";
    }>;
    payload: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export declare const StatementRefSchema: z.ZodObject<{
    statementId: z.ZodString;
    relationship: z.ZodEnum<{
        motivates: "motivates";
        constrains: "constrains";
        supersedes_prior: "supersedes_prior";
    }>;
}, z.core.$strip>;
export declare const JobSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<{
        execute_script: "execute_script";
        develop_script: "develop_script";
        plan: "plan";
        notify_user: "notify_user";
        replan: "replan";
        initiative_setup: "initiative_setup";
    }>;
    status: z.ZodEnum<{
        pending: "pending";
        blocked: "blocked";
        running: "running";
        completed: "completed";
        failed: "failed";
    }>;
    goal: z.ZodString;
    dependsOn: z.ZodArray<z.ZodString>;
    createdBy: z.ZodString;
    plan: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        description: z.ZodString;
        steps: z.ZodArray<z.ZodObject<{
            description: z.ZodString;
            scriptId: z.ZodOptional<z.ZodString>;
            missingReason: z.ZodOptional<z.ZodString>;
            params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
            order: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>>>;
    result: z.ZodOptional<z.ZodUnknown>;
    evidence: z.ZodArray<z.ZodObject<{
        statementId: z.ZodString;
        relationship: z.ZodEnum<{
            motivates: "motivates";
            constrains: "constrains";
            supersedes_prior: "supersedes_prior";
        }>;
    }, z.core.$strip>>;
    callbacks: z.ZodArray<z.ZodObject<{
        on: z.ZodEnum<{
            complete: "complete";
            fail: "fail";
        }>;
        action: z.ZodEnum<{
            create_job: "create_job";
            notify_orchestrator: "notify_orchestrator";
            notify_planner: "notify_planner";
            update_initiative: "update_initiative";
        }>;
        payload: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>>;
    channel: z.ZodArray<z.ZodString>;
    timestamps: z.ZodObject<{
        created: z.ZodString;
        started: z.ZodOptional<z.ZodString>;
        completed: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const ReviewerResponseSchema: z.ZodObject<{
    decision: z.ZodEnum<{
        allow: "allow";
        "flag-and-halt": "flag-and-halt";
        "flag-and-continue": "flag-and-continue";
        "request-modifications": "request-modifications";
        fafc: "fafc";
    }>;
    reasoning: z.ZodString;
    modifications: z.ZodOptional<z.ZodString>;
    summary: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
