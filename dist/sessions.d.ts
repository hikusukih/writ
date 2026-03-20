import type { MessageParam } from "./agents/claude-client.js";
export declare function loadSession(dir: string, filename?: string): Promise<MessageParam[]>;
export declare function saveSession(dir: string, history: MessageParam[], filename?: string): Promise<void>;
