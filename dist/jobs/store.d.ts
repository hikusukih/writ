import type { Job } from "./types.js";
export interface JobStore {
    createJob(partial: Omit<Job, "id" | "status" | "timestamps">): Promise<Job>;
    getJob(id: string): Promise<Job | null>;
    updateJob(id: string, updates: Partial<Job>): Promise<Job>;
    getReady(): Promise<Job[]>;
    getRunning(): Promise<Job[]>;
    getAll(): Promise<Job[]>;
}
export declare function createJobStore(dir: string): Promise<JobStore>;
