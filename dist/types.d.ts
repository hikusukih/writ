export type AgentClass = "os" | "planner" | "action";
export type ReviewDecision = "allow" | "flag-and-halt" | "flag-and-continue" | "request-modifications" | "fafc";
export interface ReviewLogEntry {
    timestamp: string;
    subjectAgentId: string;
    decision: ReviewDecision;
    reasoning: string;
    reviewerType: "rule" | "llm";
    contentHash: string;
}
export interface ReviewResult {
    decision: ReviewDecision;
    reasoning: string;
    matchedRules?: string[];
    modifications?: string;
    summary?: string;
}
export interface PlanStep {
    description: string;
    scriptId?: string;
    /** Set to "__missing__" + missingReason when LP needs a script that doesn't exist yet. */
    missingReason?: string;
    params?: Record<string, string>;
    order: number;
}
export interface WorkAssignment {
    id: string;
    description: string;
    context?: string;
    constraints?: string[];
}
export interface LieutenantPlanResult {
    plan: Plan;
    missingScripts: {
        name: string;
        capability: string;
    }[];
}
export interface Plan {
    id: string;
    description: string;
    steps: PlanStep[];
}
export interface StrategicPlan {
    id: string;
    description: string;
    assignments: WorkAssignment[];
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
    /** Reviewer config by agent ID — {agentId}-reviewer-agent.md contents. Optional: not all agents may have reviewer configs. */
    reviewerConfigs?: Record<string, string>;
    /** Per-agent anti-pattern lists — keyed by agent ID. Loaded from anti-patterns/ directory. */
    antiPatterns?: Record<string, string>;
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
export interface DeveloperWriterRequest {
    capability: string;
    existingScripts: ScriptInfo[];
    context?: string;
}
export interface DeveloperWriterResult {
    scriptContent: string;
    scriptName: string;
    testSuggestions?: string;
}
export interface RRInput {
    reviewLogEntry: ReviewLogEntry;
    soul: string;
    constitution: string;
}
export interface RROutput {
    consistent: boolean;
    override?: ReviewDecision;
    violationSummary?: string;
}
/** Structural constraint: NO task content fields. Only constitutional-level metadata. */
export interface ViolationSummary {
    violatedPrinciple: string;
    errorClass: string;
    affectedAgentId: string;
    affectedReviewerId?: string;
}
export interface BBInput {
    violation: ViolationSummary;
    agentConfig: string;
    reviewerConfig?: string;
    soul: string;
    constitution: string;
}
export interface BBOutput {
    updatedAgentConfig?: string;
    updatedReviewerConfig?: string;
    changeRationale: string;
}
export interface SamplingRateEntry {
    rate: number;
    cleanCount: number;
    lastFlagTimestamp?: string;
}
export interface SamplingRateDefaults {
    floor: number;
    osFloor: number;
    initialRate: number;
    decayPerClean: number;
}
export interface SamplingRateState {
    rates: Record<string, SamplingRateEntry>;
    defaults: SamplingRateDefaults;
}
export interface SemanticReviewResult {
    approved: boolean;
    concerns?: string[];
    planAlignment: "aligned" | "divergent" | "unclear";
}
export interface OrchestratorResult {
    response: string;
    provenance: ProvenanceEntry[];
    /** Compact summary of scripts that ran this turn (for conversation history context) */
    sideEffects?: string;
}
