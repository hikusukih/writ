function ok(content) {
    return { content, inputTokens: 10, outputTokens: 10 };
}
const DEFAULT_STRATEGIC_PLAN = JSON.stringify({
    id: "strategic-test",
    description: "Complete the requested task",
    assignments: [{ id: "assign-1", description: "Execute the task" }],
});
const DEFAULT_DETAILED_PLAN = JSON.stringify({
    id: "plan-test",
    description: "Execute task using list-files script",
    steps: [
        {
            description: "List files in project root",
            scriptId: "list-files",
            params: { TARGET_DIR: "." },
            order: 0,
        },
    ],
});
const MISSING_SCRIPT_PLAN = JSON.stringify({
    id: "plan-missing",
    description: "Execute task requiring a new script",
    steps: [
        {
            description: "Generate custom output",
            scriptId: "__missing__",
            missingReason: "needs a script that generates custom output",
            params: { SCRIPT_NAME: "custom-output" },
            order: 0,
        },
    ],
});
const DW_AFTER_PLAN = JSON.stringify({
    id: "plan-after-dw",
    description: "Execute task with newly generated script",
    steps: [
        {
            description: "Generate custom output",
            scriptId: "custom-output",
            params: {},
            order: 0,
        },
    ],
});
const DW_SCRIPT = JSON.stringify({
    scriptName: "custom-output",
    scriptContent: [
        "#!/bin/bash",
        "# @name custom-output",
        "# @description Generate custom output for integration tests",
        "echo 'custom output generated'",
    ].join("\n"),
    testSuggestions: "Run and verify output contains 'custom output generated'",
});
const DEFAULT_REVIEWER_ALLOW = JSON.stringify({
    decision: "allow",
    reasoning: "Content is safe and appropriate.",
});
export function createMockLLMClient(options = {}) {
    const callLog = [];
    let lpCallCount = 0;
    const reviewerResponse = options.reviewerDecision ?? DEFAULT_REVIEWER_ALLOW;
    async function sendMessage(systemPrompt, userMessage) {
        // LLM reviewer: system prompt begins with the reviewer preamble
        if (systemPrompt.includes("You are the security and ethics reviewer")) {
            callLog.push("reviewer");
            return ok(reviewerResponse);
        }
        // HJA summary generator
        if (systemPrompt.includes("You summarize review findings")) {
            callLog.push("hja-summary");
            return ok("This action requires your confirmation before proceeding.");
        }
        // Orchestrator: interpret user request
        if (userMessage.startsWith("Restate the following user request")) {
            callLog.push("orchestrator-interpret");
            return ok("Execute the requested task.");
        }
        // General Planner: strategic plan (prompt contains "strategic-" as example format)
        if (userMessage.startsWith("Task:") && userMessage.includes('"id":"strategic-')) {
            callLog.push("gp-strategic-plan");
            return ok(DEFAULT_STRATEGIC_PLAN);
        }
        // Lieutenant Planner: detailed plan
        if (userMessage.startsWith("Work Assignment [")) {
            lpCallCount++;
            callLog.push(`lp-detailed-plan-${lpCallCount}`);
            if (options.firstLPMissing && lpCallCount === 1) {
                return ok(MISSING_SCRIPT_PLAN);
            }
            if (options.firstLPMissing && lpCallCount >= 2) {
                return ok(DW_AFTER_PLAN);
            }
            return ok(DEFAULT_DETAILED_PLAN);
        }
        // Developer/Writer: generate script
        if (userMessage.includes("Generate a shell script for this capability")) {
            callLog.push("dw-generate");
            return ok(DW_SCRIPT);
        }
        // Orchestrator: response synthesis
        if (userMessage.includes("The user asked:")) {
            callLog.push("orchestrator-response");
            return ok("Task completed successfully.");
        }
        // Catch-all fallback
        callLog.push("unknown");
        return ok("Done.");
    }
    async function sendMessages(systemPrompt, messages) {
        const last = messages[messages.length - 1];
        let content = "";
        if (typeof last.content === "string") {
            content = last.content;
        }
        else if (Array.isArray(last.content)) {
            content = last.content
                .filter((b) => "type" in b && b.type === "text")
                .map((b) => ("text" in b ? b.text : ""))
                .join("");
        }
        return sendMessage(systemPrompt, content);
    }
    return { callLog, sendMessage, sendMessages };
}
