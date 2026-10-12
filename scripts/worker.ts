/**
 * Standalone job worker for PostgreSQL deployments (run the web app with
 * INLINE_WORKER=false). PGlite allows one process, so with PGlite the web
 * server runs the worker in-process instead.
 */
import { getDb } from "../src/lib/db";
import { workerTick } from "../src/lib/jobs/worker";

if (!process.env.DATABASE_URL) {
  console.error("scripts/worker.ts needs DATABASE_URL (PostgreSQL). With PGlite the web server runs the worker inline.");
  process.exit(1);
}
const interval = Number(process.env.WORKER_INTERVAL_MS || 2000);
let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));
await getDb();
console.log(`[worker] started, polling every ${interval}ms`);
while (!stopping) {
  try {
    const n = await workerTick();
    if (n === 0) await new Promise((r) => setTimeout(r, interval));
  } catch (e) {
    console.error("[worker] tick failed:", e instanceof Error ? e.message : e);
    await new Promise((r) => setTimeout(r, interval));
  }
}
console.log("[worker] stopped");
(await getDb()).close();
