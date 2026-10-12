import { getDb } from "../db";
import { HANDLERS, onDeadJob } from "../orders/workflow";
import { log } from "../redact";
import { enqueue, runReadyJobs } from "./queue";

const SWEEP_EVERY_MS = Number(process.env.SWEEP_EVERY_SECONDS || 300) * 1000;
let lastSweep = 0;

/** One worker tick: schedule periodic sweeps, then run ready jobs. */
export async function workerTick(max = 50): Promise<number> {
  if (Date.now() - lastSweep > SWEEP_EVERY_MS) {
    lastSweep = Date.now();
    const db = await getDb();
    const bucket = Math.floor(Date.now() / SWEEP_EVERY_MS);
    await enqueue(db, "system.sweep", {}, { dedupeKey: `sweep:${bucket}`, maxAttempts: 2 });
  }
  return runReadyJobs(HANDLERS, { onDead: onDeadJob }, max);
}

/** Drain everything that is ready now (tests and demos). */
export async function drainJobs(maxRounds = 50): Promise<void> {
  for (let i = 0; i < maxRounds; i++) {
    const n = await runReadyJobs(HANDLERS, { onDead: onDeadJob }, 100);
    if (n === 0) return;
  }
}

const g = globalThis as unknown as { __brickloopWorker?: NodeJS.Timeout };

/** In-process worker loop (used with PGlite, which allows a single process). */
export function startInlineWorker(intervalMs = 2000) {
  if (g.__brickloopWorker) return;
  let busy = false;
  g.__brickloopWorker = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await workerTick();
    } catch (e) {
      log.warn(`worker tick failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      busy = false;
    }
  }, intervalMs);
  log.info(`inline worker started (every ${intervalMs}ms)`);
}
