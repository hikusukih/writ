import type { AgentConfig, IdentityContext } from "../types.js";
export declare function loadIdentity(basePath: string): Promise<IdentityContext>;
export declare function getAgentConfig(identity: IdentityContext, agentId: string): AgentConfig;
