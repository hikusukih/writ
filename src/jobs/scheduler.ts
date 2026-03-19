import type { IOAdapter } from "../io/IOAdapter.js";
import type { Job } from "./types.js";
import type { JobStore } from "./store.js";
import { verbose, easternTimestamp } from "../logger.js";

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

export function createScheduler(
  store: JobStore,
  executor: JobExecutor,
  adapter: IOAdapter | undefined,
  options: SchedulerOptions = {}
): Scheduler {
  const { concurrencyLimit = 3, tickIntervalMs = 100, onNotify } = options;

  // Waiters: callbacks waiting for specific jobs to finish
  const waiters = new Map<string, Array<(job: Job) => void>>();

  function notifyWaiters(job: Job): void {
    const callbacks = waiters.get(job.id);
    if (callbacks) {
      for (const cb of callbacks) cb(job);
      waiters.delete(job.id);
    }
  }

  async function processCallbacks(job: Job): Promise<void> {
    const triggerEvent = job.status === "completed" ? "complete" : "fail";
    for (const cb of job.callbacks) {
      if (cb.on !== triggerEvent) continue;
      try {
        if (cb.action === "create_job" && cb.payload) {
          await store.createJob({
            type: (cb.payload.type as Job["type"]) ?? "execute_script",
            goal: (cb.payload.goal as string) ?? "Callback job",
            dependsOn: (cb.payload.dependsOn as string[]) ?? [],
            createdBy: job.id,
            evidence: [],
            callbacks: [],
            channel: job.channel,
          });
        } else if (cb.action === "notify_orchestrator") {
          verbose("Scheduler: notify_orchestrator callback", { jobId: job.id });
          onNotify?.(job);
        } else if (cb.action === "update_initiative") {
          verbose("Scheduler: update_initiative callback", { jobId: job.id, payload: cb.payload });
        }
      } catch (err) {
        verbose("Scheduler: callback error", {
          jobId: job.id,
          action: cb.action,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  async function blockDependents(failedId: string): Promise<void> {
    const all = await store.getAll();
    for (const job of all) {
      if (job.status === "pending" && job.dependsOn.includes(failedId)) {
        await store.updateJob(job.id, { status: "blocked" });
        await blockDependents(job.id);
      }
    }
  }

  async function executeJob(job: Job): Promise<void> {
    verbose("Scheduler: starting job", { id: job.id, type: job.type });
    const updated = await store.updateJob(job.id, {
      status: "running",
      timestamps: { ...job.timestamps, started: easternTimestamp() },
    });

    try {
      const result = await executor.execute(updated, adapter);
      const completed = await store.updateJob(job.id, {
        status: "completed",
        result,
        timestamps: { ...updated.timestamps, completed: easternTimestamp() },
      });
      verbose("Scheduler: job completed", { id: job.id });
      await processCallbacks(completed);
      notifyWaiters(completed);
    } catch (err) {
      const failed = await store.updateJob(job.id, {
        status: "failed",
        result: { error: err instanceof Error ? err.message : String(err) },
        timestamps: { ...updated.timestamps, completed: easternTimestamp() },
      });
      verbose("Scheduler: job failed", { id: job.id, error: err instanceof Error ? err.message : String(err) });
      await blockDependents(job.id);
      await processCallbacks(failed);
      notifyWaiters(failed);
    }
  }

  return {
    async tick() {
      const running = await store.getRunning();
      const available = concurrencyLimit - running.length;
      if (available <= 0) return;

      const ready = await store.getReady();
      const toStart = ready.slice(0, available);

      // Start jobs concurrently (fire-and-forget within tick)
      await Promise.all(toStart.map((job) => executeJob(job)));
    },

    async run() {
      while (true) {
        const running = await store.getRunning();
        const ready = await store.getReady();
        const pending = (await store.getAll()).filter((j) => j.status === "pending");

        if (running.length === 0 && ready.length === 0 && pending.length === 0) {
          break;
        }

        await this.tick();
        await new Promise((r) => setTimeout(r, tickIntervalMs));
      }
    },

    async submitJob(partial) {
      return store.createJob(partial);
    },

    getStore() {
      return store;
    },

    waitForJob(id, timeoutMs = 30000) {
      return new Promise<Job>((resolve, reject) => {
        // Check if already done
        store.getJob(id).then((job) => {
          if (job && (job.status === "completed" || job.status === "failed")) {
            resolve(job);
            return;
          }

          // Register waiter
          const existing = waiters.get(id) ?? [];
          let timer: ReturnType<typeof setTimeout> | undefined;

          const waiterFn = (completedJob: Job) => {
            if (timer) clearTimeout(timer);
            resolve(completedJob);
          };

          existing.push(waiterFn);
          waiters.set(id, existing);

          timer = setTimeout(() => {
            const callbacks = waiters.get(id);
            if (callbacks) {
              const idx = callbacks.indexOf(waiterFn);
              if (idx >= 0) callbacks.splice(idx, 1);
            }
            reject(new Error(`waitForJob("${id}") timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        });
      });
    },
  };
}
