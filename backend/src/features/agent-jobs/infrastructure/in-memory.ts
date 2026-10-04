import type { JobQueue, JobRecord, JobRepository, JobWriteCondition } from '../ports.js';

/** Test and local adapter with the same conditional-write semantics as DynamoDB. */
export class InMemoryJobRepository implements JobRepository {
  private readonly jobs = new Map<string, JobRecord>();

  async create(job: JobRecord): Promise<void> {
    const key = `${job.ownerId}|${job.jobId}`;
    if (this.jobs.has(key)) throw new Error('Job ID collision');
    this.jobs.set(key, structuredClone(job));
  }

  async get(ownerId: string, jobId: string): Promise<JobRecord | null> {
    const job = this.jobs.get(`${ownerId}|${jobId}`);
    return job ? structuredClone(job) : null;
  }

  async put(job: JobRecord, condition: JobWriteCondition): Promise<boolean> {
    const key = `${job.ownerId}|${job.jobId}`;
    const current = this.jobs.get(key);
    if (!current) return false;
    if (condition.status && !condition.status.includes(current.status)) return false;
    if (condition.leaseToken !== undefined && current.leaseToken !== condition.leaseToken) return false;
    this.jobs.set(key, structuredClone(job));
    return true;
  }
}

/** Collects messages; tests and the local server drain it explicitly. */
export class InMemoryJobQueue implements JobQueue {
  readonly messages: { ownerId: string; jobId: string }[] = [];

  async enqueue(message: { ownerId: string; jobId: string }): Promise<void> {
    this.messages.push(message);
  }
}
