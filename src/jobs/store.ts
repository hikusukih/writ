import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { JobSchema } from "../schemas.js";
import { easternTimestamp } from "../logger.js";
import type { Job } from "./types.js";

export interface JobStore {
  createJob(partial: Omit<Job, "id" | "status" | "timestamps">): Promise<Job>;
  getJob(id: string): Promise<Job | null>;
  updateJob(id: string, updates: Partial<Job>): Promise<Job>;
  getReady(): Promise<Job[]>;
  getRunning(): Promise<Job[]>;
  getAll(): Promise<Job[]>;
}

function extractNumericId(id: string): number {
  const match = id.match(/^job-(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

export async function createJobStore(dir: string): Promise<JobStore> {
  await mkdir(dir, { recursive: true });

  // In-memory cache, synced to disk
  const jobs = new Map<string, Job>();
  let nextId = 1;

  // Load existing jobs from disk
  try {
    const files = await readdir(dir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const content = await readFile(join(dir, file), "utf-8");
        const job = JobSchema.parse(JSON.parse(content));
        jobs.set(job.id, job);
        const numId = extractNumericId(job.id);
        if (numId >= nextId) nextId = numId + 1;
      } catch {
        // Skip malformed job files
      }
    }
  } catch {
    // Directory may be empty — that's fine
  }

  async function persist(job: Job): Promise<void> {
    await writeFile(join(dir, `${job.id}.json`), JSON.stringify(job, null, 2));
  }

  return {
    async createJob(partial) {
      const id = `job-${nextId++}`;

      // Cycle prevention: all dependsOn IDs must have lower numeric IDs
      for (const depId of partial.dependsOn) {
        const depNum = extractNumericId(depId);
        const newNum = extractNumericId(id);
        if (depNum >= newNum) {
          throw new Error(
            `Cycle prevention: dependency "${depId}" (${depNum}) must have a lower ID than "${id}" (${newNum})`
          );
        }
      }

      const job: Job = {
        ...partial,
        id,
        status: "pending",
        timestamps: { created: easternTimestamp() },
      };

      jobs.set(id, job);
      await persist(job);
      return job;
    },

    async getJob(id) {
      return jobs.get(id) ?? null;
    },

    async updateJob(id, updates) {
      const existing = jobs.get(id);
      if (!existing) throw new Error(`Job "${id}" not found`);

      const updated: Job = { ...existing, ...updates, id }; // ID is immutable
      jobs.set(id, updated);
      await persist(updated);
      return updated;
    },

    async getReady() {
      const result: Job[] = [];
      for (const job of jobs.values()) {
        if (job.status !== "pending") continue;
        const allDepsCompleted = job.dependsOn.every((depId) => {
          const dep = jobs.get(depId);
          return dep && dep.status === "completed";
        });
        if (allDepsCompleted) result.push(job);
      }
      return result;
    },

    async getRunning() {
      return [...jobs.values()].filter((j) => j.status === "running");
    },

    async getAll() {
      return [...jobs.values()];
    },
  };
}
