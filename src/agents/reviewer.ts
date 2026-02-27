import type { IdentityContext, ReviewResult } from "../types.js";

interface ReviewRule {
  name: string;
  pattern: RegExp;
  reasoning: string;
}

const RULES: ReviewRule[] = [
  {
    name: "env-variable-reference",
    pattern: /\$[A-Z_]+|process\.env\.[A-Za-z_]+/,
    reasoning: "Output references environment variables which may expose secrets",
  },
  {
    name: "api-key-pattern",
    pattern: /(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9+/=_-]{16,}/i,
    reasoning: "Output appears to contain an API key, token, or secret value",
  },
  {
    name: "sudo-usage",
    pattern: /\bsudo\b/,
    reasoning: "Output contains sudo which could escalate privileges",
  },
  {
    name: "dangerous-permissions",
    pattern: /chmod\s+777/,
    reasoning: "Output sets world-writable permissions which is a security risk",
  },
  {
    name: "private-key-block",
    pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
    reasoning: "Output contains a private key",
  },
];

export function reviewOutput(
  output: string,
  _identity: IdentityContext
): ReviewResult {
  const matchedRules: string[] = [];
  const reasons: string[] = [];

  for (const rule of RULES) {
    if (rule.pattern.test(output)) {
      matchedRules.push(rule.name);
      reasons.push(rule.reasoning);
    }
  }

  if (matchedRules.length > 0) {
    return {
      decision: "flag-and-halt",
      reasoning: reasons.join("; "),
      matchedRules,
    };
  }

  return {
    decision: "allow",
    reasoning: "No rule violations detected",
  };
}
