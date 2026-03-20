import type { IOAdapter } from "../io/IOAdapter.js";
import type { Job } from "./types.js";
import type { JobStore } from "./store.js";
export interface JobExecutor {
    execute(job: Job, adapter: IOAdapter | undefined): Promise<unknown>;
}
export interface Scheduler {
    tick(): Promise<void>;
    run(): Promise<void>;
    submitJob(partial: Omit<Job, "id" | "status" | "timestamps">): Promise<Job>;
    waitForJob(id: string, timeoutMs?: number): Promise<Job>;
    getStore(): JobStore;
}
export interface SchedulerOptions {
    concurrencyLimit?: number;
    tickIntervalMs?: number;
    onNotify?: (job: Job) => void;
}
export declare function createScheduler(store: JobStore, executor: JobExecutor, adapter: IOAdapter | undefined, options?: SchedulerOptions): Scheduler;
