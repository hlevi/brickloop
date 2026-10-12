import crypto from "node:crypto";
import { getDb } from "../db";
import { getSimulatorSettings, updateSimulatorSettings } from "../settings";
import { PaymentDeclinedError, PaymentOperationError, type Authorization, type AuthorizeRequest, type PaymentProvider } from "./types";

/**
 * Sandbox payment provider. Holds state in sim_* tables so idempotency and
 * authorization expiry behave like a separate system. No money moves.
 */
export class SimulatedPaymentProvider implements PaymentProvider {
  id = "simulated";
  mode = "simulated" as const;
  authWindowHours = 168; // 7 days, a common card authorization window; confirm per provider before live use

  async authorize(req: AuthorizeRequest): Promise<Authorization> {
    const db = await getDb();
    const prior = await db.query<{ ref: string; amount_cents: number; expires_at: Date | string; status: string }>(
      `SELECT ref, amount_cents, expires_at, status FROM sim_payments WHERE idempotency_key = $1`,
      [req.idempotencyKey],
    );
    if (prior.rows[0]) {
      const p = prior.rows[0];
      if (p.status === "declined") throw new PaymentDeclinedError("Card declined (simulated)");
      return { ref: p.ref, amountCents: p.amount_cents, expiresAt: new Date(p.expires_at).toISOString() };
    }
    const declined = await db.tx(async (q) => {
      const sim = await getSimulatorSettings(q);
      if (sim.nextAuthorizationDeclined) await updateSimulatorSettings({ nextAuthorizationDeclined: false }, "simulator", q);
      return sim.nextAuthorizationDeclined || req.method === "sim_decline";
    });
    const ref = `SIMPAY-${crypto.randomUUID().slice(0, 12)}`;
    const expiresAt = new Date(Date.now() + this.authWindowHours * 3600_000).toISOString();
    const ins = await db.query<{ ref: string }>(
      `INSERT INTO sim_payments(ref, idempotency_key, amount_cents, status, expires_at) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING ref`,
      [ref, req.idempotencyKey, req.amountCents, declined ? "declined" : req.method === "sim_capture_fail" ? "authorized_capture_fail" : "authorized", expiresAt],
    );
    // A concurrent request with the same key won the insert: return its result.
    if (!ins.rows[0]) return this.authorize(req);
    if (declined) throw new PaymentDeclinedError("Card declined (simulated)");
    return { ref, amountCents: req.amountCents, expiresAt };
  }

  private async op<T>(key: string, ref: string, op: string, fn: () => Promise<T>): Promise<T> {
    const db = await getDb();
    const prior = await db.query<{ result: T }>(`SELECT result FROM sim_payment_ops WHERE idempotency_key = $1`, [key]);
    if (prior.rows[0]) return prior.rows[0].result;
    const result = await fn();
    await db.query(`INSERT INTO sim_payment_ops(idempotency_key, ref, op, result) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [key, ref, op, JSON.stringify(result)]);
    return result;
  }

  private async load(ref: string) {
    const db = await getDb();
    const { rows } = await db.query<{ status: string; amount_cents: number; captured_cents: number; refunded_cents: number; expires_at: Date | string }>(
      `SELECT status, amount_cents, captured_cents, refunded_cents, expires_at FROM sim_payments WHERE ref = $1`,
      [ref],
    );
    if (!rows[0]) throw new PaymentOperationError(`Unknown payment ${ref}`);
    return rows[0];
  }

  async capture(ref: string, amountCents: number, key: string) {
    return this.op(key, ref, "capture", async () => {
      const db = await getDb();
      const p = await this.load(ref);
      const failFlag = await db.tx(async (q) => {
        const sim = await getSimulatorSettings(q);
        if (sim.nextCaptureFails) await updateSimulatorSettings({ nextCaptureFails: false }, "simulator", q);
        return sim.nextCaptureFails;
      });
      if (failFlag || p.status === "authorized_capture_fail") throw new PaymentOperationError("Capture failed (simulated processor error)");
      if (p.status === "captured") return { capturedCents: p.captured_cents };
      if (!p.status.startsWith("authorized")) throw new PaymentOperationError(`Cannot capture a payment in status ${p.status}`);
      if (new Date(p.expires_at).getTime() < Date.now()) throw new PaymentOperationError("Authorization expired");
      if (amountCents > p.amount_cents) throw new PaymentOperationError("Capture exceeds authorized amount");
      await db.query(`UPDATE sim_payments SET status = 'captured', captured_cents = $2 WHERE ref = $1`, [ref, amountCents]);
      return { capturedCents: amountCents };
    });
  }

  async void(ref: string, key: string) {
    await this.op(key, ref, "void", async () => {
      const p = await this.load(ref);
      if (p.status === "voided") return { ok: true };
      if (!p.status.startsWith("authorized")) throw new PaymentOperationError(`Cannot void a payment in status ${p.status}`);
      const db = await getDb();
      await db.query(`UPDATE sim_payments SET status = 'voided' WHERE ref = $1`, [ref]);
      return { ok: true };
    });
  }

  async refund(ref: string, amountCents: number, key: string) {
    return this.op(key, ref, "refund", async () => {
      const p = await this.load(ref);
      if (p.status !== "captured" && p.status !== "refunded") throw new PaymentOperationError(`Cannot refund a payment in status ${p.status}`);
      if (p.refunded_cents + amountCents > p.captured_cents) throw new PaymentOperationError("Refund exceeds captured amount");
      const db = await getDb();
      await db.query(`UPDATE sim_payments SET status = 'refunded', refunded_cents = refunded_cents + $2 WHERE ref = $1`, [ref, amountCents]);
      return { refundedCents: amountCents };
    });
  }
}

let instance: SimulatedPaymentProvider | null = null;
export function getPaymentProvider(id = process.env.PAYMENT_PROVIDER || "simulated"): PaymentProvider {
  if (id !== "simulated") throw new PaymentOperationError(`Payment provider "${id}" is not implemented; only the sandbox simulator is available`);
  return (instance ??= new SimulatedPaymentProvider());
}
