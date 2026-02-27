import type { AgentConfig, AgentOutput, IdentityContext } from "../types.js";
import type { LLMClient } from "./claude-client.js";
export declare function invokeAgent(client: LLMClient, agentConfig: AgentConfig, input: string, identity: IdentityContext): Promise<AgentOutput>;
