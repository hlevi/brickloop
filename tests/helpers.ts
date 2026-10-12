import { resetDbForTests, getDb } from "@/lib/db";
import { drainJobs } from "@/lib/jobs/worker";

process.env.BRICKLOOP_QUIET = "1";
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || `/tmp/brickloop-test-uploads-${process.pid}`;

export async function freshDb() {
  return resetDbForTests();
}

/** Run every queued job now (ignoring delays), repeatedly, until nothing is left to do. */
export async function runAll(rounds = 20) {
  const db = await getDb();
  for (let i = 0; i < rounds; i++) {
    await db.query(`UPDATE jobs SET run_at = now() WHERE status = 'queued'`);
    const before = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM jobs WHERE status = 'queued'`);
    await drainJobs(5);
    const after = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM jobs WHERE status = 'queued'`);
    if (Number(before.rows[0].n) === 0 && Number(after.rows[0].n) === 0) return;
  }
}

export const CONTACT = {
  name: "Pat Example",
  email: "pat@example.com",
  shipTo: { line1: "1 Test Street", city: "Springfield", region: "IL", postalCode: "62701", country: "US" },
};

export async function orderStatus(orderId: string) {
  const db = await getDb();
  return (await db.query<{ status: string }>(`SELECT status FROM orders WHERE id = $1`, [orderId])).rows[0].status;
}

export async function openExceptions(orderId: string) {
  const db = await getDb();
  return (await db.query<{ id: string; kind: string; exposure_cents: number; actions: string[]; urgent: boolean }>(`SELECT * FROM exceptions WHERE order_id = $1 AND status = 'open'`, [orderId])).rows;
}
