export function createTestAdapter(options = {}) {
    const { confirmationAnswer = true } = options;
    const collected = {
        results: [],
        errors: [],
        reviewBlocks: [],
        statusMessages: [],
        confirmationRequests: [],
        acknowledgments: [],
        progressMessages: [],
    };
    return {
        collected,
        sendResult(response, provenanceChain) {
            collected.results.push({ response, provenanceChain });
        },
        sendError(message) {
            collected.errors.push(message);
        },
        sendReviewBlock(reasoning, matchedRules) {
            collected.reviewBlocks.push({ reasoning, matchedRules });
        },
        sendStatus(message) {
            collected.statusMessages.push(message);
        },
        sendAcknowledgment(message) {
            collected.acknowledgments.push(message);
        },
        sendProgress(jobId, message) {
            collected.progressMessages.push({ jobId, message });
        },
        onRequest(_handler) {
            // No-op: tests call handleRequest() directly
        },
        async start() {
            // No-op
        },
        async requestConfirmation(summary, details) {
            collected.confirmationRequests.push({ summary, details });
            return confirmationAnswer;
        },
        stop() {
            // No-op
        },
        getChannel() {
            return ["test"];
        },
    };
}
