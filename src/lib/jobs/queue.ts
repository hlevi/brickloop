import os from "node:os";
import { getDb, type Queryable } from "../db";
import { log } from "../redact";

export interface JobRow {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  max_attempts: number;
  dedupe_key: string | null;
}

export interface EnqueueOptions {
  dedupeKey?: string;
  delaySeconds?: number;
  maxAttempts?: number;
}

/** Enqueue a job. A dedupe key makes enqueueing idempotent. Returns the job id (existing one on dedupe). */
export async function enqueue(q: Queryable, type: string, payload: Record<string, unknown>, opts: EnqueueOptions = {}): Promise<number> {
  const runAt = new Date(Date.now() + (opts.delaySeconds ?? 0) * 1000).toISOString();
  const { rows } = await q.query<{ id: number }>(
    `INSERT INTO jobs(type, payload, status, max_attempts, run_at, dedupe_key)
     VALUES ($1,$2,'queued',$3,$4,$5)
     ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
    [type, JSON.stringify(payload), opts.maxAttempts ?? 5, runAt, opts.dedupeKey ?? null],
  );
  if (rows[0]) return Number(rows[0].id);
  const existing = await q.query<{ id: number }>(`SELECT id FROM jobs WHERE dedupe_key = $1`, [opts.dedupeKey]);
  return Number(existing.rows[0].id);
}

export type JobHandler = (job: JobRow) => Promise<void>;

/** Thrown by a handler to request a retry later without counting as a failure. */
export class RetryLater extends Error {
  constructor(public readonly delaySeconds: number, message = "retry later") {
    super(message);
  }
}

const WORKER_ID = `${os.hostname()}:${process.pid}`;
const STALE_LOCK_SECONDS = 300;

async function claim(): Promise<JobRow | null> {
  const db = await getDb();
  // Recover jobs whose worker died mid-run (lock older than the stale threshold).
  await db.query(
    `UPDATE jobs SET status = 'queued', locked_at = NULL, locked_by = NULL, updated_at = now()
     WHERE status = 'running' AND locked_at < now() - ($1 || ' seconds')::interval`,
    [String(STALE_LOCK_SECONDS)],
  );
  const { rows } = await db.query<JobRow>(
    `UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_at = now(), locked_by = $1, updated_at = now()
     WHERE id = (SELECT id FROM jobs WHERE status = 'queued' AND run_at <= now() ORDER BY run_at, id LIMIT 1 FOR UPDATE SKIP LOCKED)
     RETURNING id, type, payload, status, attempts, max_attempts, dedupe_key`,
    [WORKER_ID],
  );
  return rows[0] ?? null;
}

export interface WorkerHooks {
  /** Called when a job has exhausted its attempts. */
  onDead?: (job: JobRow, error: string) => Promise<void>;
}

/** Run ready jobs until none remain (or `max` jobs ran). Returns the number processed. */
export async function runReadyJobs(handlers: Record<string, JobHandler>, hooks: WorkerHooks = {}, max = 100): Promise<number> {
  const db = await getDb();
  let n = 0;
  while (n < max) {
    const job = await claim();
    if (!job) break;
    n++;
    const started = new Date().toISOString();
    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`No handler for job type ${job.type}`);
      await handler(job);
      await db.query(`UPDATE jobs SET status = 'succeeded', locked_at = NULL, last_error = NULL, updated_at = now() WHERE id = $1`, [job.id]);
      await db.query(`INSERT INTO job_attempts(job_id, attempt, started_at, finished_at, outcome) VALUES ($1,$2,$3,now(),'succeeded')`, [job.id, job.attempts, started]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof RetryLater) {
        // Not a failure: give the attempt back.
        await db.query(
          `UPDATE jobs SET status = 'queued', attempts = attempts - 1, locked_at = NULL, run_at = now() + ($2 || ' seconds')::interval, updated_at = now() WHERE id = $1`,
          [job.id, String(e.delaySeconds)],
        );
        await db.query(`INSERT INTO job_attempts(job_id, attempt, started_at, finished_at, outcome, error) VALUES ($1,$2,$3,now(),'deferred',$4)`, [job.id, job.attempts, started, msg]);
        continue;
      }
      const dead = job.attempts >= job.max_attempts;
      const backoff = Math.min(600, 5 * 2 ** (job.attempts - 1));
      await db.query(
        `UPDATE jobs SET status = $2, locked_at = NULL, last_error = $3, run_at = now() + ($4 || ' seconds')::interval, updated_at = now() WHERE id = $1`,
        [job.id, dead ? "dead" : "queued", msg, String(backoff)],
      );
      await db.query(`INSERT INTO job_attempts(job_id, attempt, started_at, finished_at, outcome, error) VALUES ($1,$2,$3,now(),$4,$5)`, [
        job.id,
        job.attempts,
        started,
        dead ? "dead" : "failed",
        msg,
      ]);
      log.warn(`job ${job.type}#${job.id} attempt ${job.attempts} failed${dead ? " (dead)" : ""}: ${msg}`);
      if (dead && hooks.onDead) await hooks.onDead(job, msg).catch((err) => log.warn(`onDead hook failed: ${err}`));
    }
  }
  return n;
}
