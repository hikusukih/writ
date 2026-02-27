import { reviewOutput } from "./reviewer.js";
export function withReview(agentFn, identity, onHalt) {
    return async (input) => {
        const output = await agentFn(input);
        const review = reviewOutput(output.content, identity);
        if (review.decision === "allow") {
            return output;
        }
        if (review.decision === "flag-and-halt") {
            if (onHalt) {
                const userApproved = await onHalt(review.reasoning, output.content);
                if (userApproved) {
                    return output;
                }
            }
            throw new ReviewHaltError(review.reasoning, output.content, review.matchedRules);
        }
        // flag-and-continue: return output but log the flag
        return output;
    };
}
export class ReviewHaltError extends Error {
    reasoning;
    flaggedOutput;
    matchedRules;
    constructor(reasoning, flaggedOutput, matchedRules) {
        super(`Review halted: ${reasoning}`);
        this.reasoning = reasoning;
        this.flaggedOutput = flaggedOutput;
        this.matchedRules = matchedRules;
        this.name = "ReviewHaltError";
    }
}
