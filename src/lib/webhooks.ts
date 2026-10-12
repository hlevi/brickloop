import crypto from "node:crypto";
import { getDb } from "./db";
import { audit } from "./audit";
import { env } from "./config";
import { enqueue } from "./jobs/queue";
import { AppError } from "./util";

const TOLERANCE_SECONDS = 300;

export function signWebhook(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const sig = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

/** Verify "t=<unix>,v1=<hex hmac-sha256 of `${t}.${body}`>" with a timestamp tolerance. */
export function verifyWebhookSignature(body: string, header: string | null, secret: string, now = Math.floor(Date.now() / 1000)): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now - t) > TOLERANCE_SECONDS || !parts.v1) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(parts.v1, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface WebhookEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

/**
 * Accept a signed webhook. Events are stored once (duplicates are acknowledged
 * and ignored). Webhooks only trigger a re-check: state changes always come
 * from querying the provider, so a forged or stale payload cannot mark an
 * order shipped by itself.
 */
export async function handleWebhook(provider: string, rawBody: string, signature: string | null): Promise<{ duplicate: boolean }> {
  if (!["simulator", "simulated-payments"].includes(provider)) throw new AppError("unknown_provider", "Unknown webhook provider", 404);
  if (!verifyWebhookSignature(rawBody, signature, env.webhookSecret)) throw new AppError("bad_signature", "Invalid webhook signature", 401);
  let event: WebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    throw new AppError("bad_payload", "Invalid JSON", 400);
  }
  if (typeof event.id !== "string" || typeof event.type !== "string") throw new AppError("bad_payload", "Missing id or type", 400);
  const db = await getDb();
  return db.tx(async (q) => {
    const ins = await q.query<{ id: number }>(
      `INSERT INTO webhook_events(provider, event_id, type, payload) VALUES ($1,$2,$3,$4) ON CONFLICT (provider, event_id) DO NOTHING RETURNING id`,
      [provider, event.id, event.type, JSON.stringify(event)],
    );
    if (!ins.rows[0]) return { duplicate: true };
    const orderId = typeof event.data?.orderId === "string" ? event.data.orderId : null;
    if (orderId && /^(shipment|order)\./.test(event.type)) {
      await enqueue(q, "order.track", { orderId }, { dedupeKey: `track:${orderId}:wh:${event.id}`, maxAttempts: 10 });
    }
    await q.query(`UPDATE webhook_events SET processed_at = now() WHERE id = $1`, [ins.rows[0].id]);
    await audit(q, `webhook:${provider}`, "webhook.received", "webhook", event.id, { type: event.type });
    return { duplicate: false };
  });
}
