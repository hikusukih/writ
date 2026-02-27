export type AgentClass = "os" | "planner" | "action";
export type ReviewDecision = "allow" | "flag-and-halt" | "flag-and-continue" | "request-modifications";
export interface ReviewResult {
    decision: ReviewDecision;
    reasoning: string;
    matchedRules?: string[];
    modifications?: string;
}
export interface PlanStep {
    description: string;
    scriptId?: string;
    params?: Record<string, string>;
    order: number;
}
export interface Plan {
    id: string;
    description: string;
    steps: PlanStep[];
}
export interface InstructionStep {
    scriptId: string;
    params: Record<string, string>;
    order: number;
}
export interface InstructionFile {
    planId: string;
    steps: InstructionStep[];
}
export interface ScriptResult {
    scriptId: string;
    exitCode: number;
    stdout: string;
    stderr: string;
}
export interface ScriptInfo {
    id: string;
    name: string;
    description: string;
    params: string[];
    path: string;
}
export interface AgentRegistryEntry {
    id: string;
    name: string;
    class: AgentClass;
    configFile: string;
    permissions: {
        canRead: string[];
        canWrite: string[];
    };
}
export interface AgentConfig {
    id: string;
    name: string;
    class: AgentClass;
    configFile: string;
    agentMd: string;
    permissions: {
        canRead: string[];
        canWrite: string[];
    };
}
export interface IdentityContext {
    soul: string;
    constitution: string;
    agents: AgentConfig[];
}
export interface AgentOutput {
    content: string;
    thought?: string;
    usage: {
        inputTokens: number;
        outputTokens: number;
    };
}
export interface ExecutionResult {
    planId: string;
    results: ScriptResult[];
    instructionFile: InstructionFile;
}
export interface ProvenanceEntry {
    agentId: string;
    action: string;
    output?: string;
}
export interface OrchestratorResult {
    response: string;
    provenance: ProvenanceEntry[];
}
