import { buildSystemPrompt } from "./prompt-builder.js";
import { getAgentConfig } from "../identity/loader.js";
import { createPlan } from "./planner.js";
import { executeFromPlan } from "./executor.js";
import { verbose } from "../logger.js";
/** Build the orchestrator prompt for a user request */
export function buildInterpretPrompt(userInput) {
    return `Restate the following user request as a single plain-English sentence describing what needs to be done. No bullet points, no headers, no preamble — one sentence only.

Request: "${userInput}"`;
}
export async function handleRequest(client, userInput, identity, scriptsDir, plansDir, history) {
    const provenance = [];
    // Step 1: Orchestrator interprets user intent
    const orchestratorConfig = getAgentConfig(identity, "orchestrator");
    const systemPrompt = buildSystemPrompt(orchestratorConfig, identity);
    const currentMessage = buildInterpretPrompt(userInput);
    verbose("Orchestrator: sending interpret request", {
        historyLength: history?.length ?? 0,
        message: currentMessage,
    });
    // Use conversation history if available so the orchestrator has context from prior turns.
    // History entries use the same prompt format (via buildInterpretPrompt) so the model
    // sees a consistent conversation.
    const interpretResponse = history && history.length > 0
        ? await client.sendMessages(systemPrompt, [
            ...history,
            { role: "user", content: currentMessage },
        ])
        : await client.sendMessage(systemPrompt, currentMessage);
    const taskDescription = interpretResponse.content.trim();
    verbose("Orchestrator: task description", taskDescription);
    provenance.push({
        agentId: "orchestrator",
        action: "interpreted user request",
        output: taskDescription,
    });
    // Step 2: Planner creates a plan (reads script index directly)
    verbose("Orchestrator: calling planner", taskDescription);
    const plan = await createPlan(client, taskDescription, identity, scriptsDir, plansDir);
    verbose("Orchestrator: plan created", plan);
    provenance.push({
        agentId: "planner",
        action: `created plan ${plan.id}`,
        output: plan.description,
    });
    // Step 3: Executor runs the plan
    verbose("Orchestrator: calling executor", { planId: plan.id, steps: plan.steps.length });
    const executionResult = await executeFromPlan(plan, scriptsDir, plansDir);
    verbose("Orchestrator: execution results", executionResult.results);
    const scriptsSummary = executionResult.results
        .map((r) => `${r.scriptId}: exit=${r.exitCode}`)
        .join(", ");
    provenance.push({
        agentId: "executor",
        action: `executed plan ${plan.id}`,
        output: scriptsSummary,
    });
    // Step 4: Format response
    let response;
    if (executionResult.results.length === 0) {
        // No scripts ran — figure out why and surface it so the user isn't left with silence.
        const ranIds = new Set(executionResult.instructionFile.steps.map((s) => s.scriptId));
        const skippedIds = plan.steps
            .filter((s) => s.scriptId && !ranIds.has(s.scriptId))
            .map((s) => `\`${s.scriptId}\``);
        if (skippedIds.length > 0) {
            response =
                `[No scripts ran — the plan referenced ${skippedIds.join(", ")}, ` +
                    `which ${skippedIds.length === 1 ? "does" : "do"} not exist in the script library.]\n\n` +
                    `Plan description: ${plan.description}`;
        }
        else {
            response =
                `[No scripts ran — the plan had no executable steps.]\n\nPlan description: ${plan.description}`;
        }
        verbose("Orchestrator: empty response — no scripts ran", { skippedIds, plan });
    }
    else {
        response = executionResult.results
            .map((r) => {
            const status = r.exitCode === 0 ? "success" : `error (exit ${r.exitCode})`;
            const output = r.stdout || r.stderr || "(no output)";
            return `### ${r.scriptId} [${status}]\n${output}`;
        })
            .join("\n\n");
    }
    return { response, provenance };
}
