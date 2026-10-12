import { getDb, type Queryable } from "../db";
import { audit } from "../audit";
import { env } from "../config";
import { log } from "../redact";
import { uuid } from "../util";
import { transition } from "../orders/stateMachine";

export type ExceptionKind =
  | "validation_failed"
  | "unvalidated_design"
  | "unresolved_parts"
  | "quote_incomplete"
  | "quote_changed"
  | "limit_exceeded"
  | "contribution_below_minimum"
  | "supplier_failure"
  | "uncertain_purchase"
  | "partial_procurement"
  | "payment_failed"
  | "capture_failed"
  | "auth_expiring"
  | "delivery_delayed"
  | "cancellation_request"
  | "refund_request"
  | "job_failed";

export type ResolutionAction =
  | "retry_validation"
  | "retry_quote"
  | "retry_procurement"
  | "offer_revised_quote"
  | "cancel_and_release"
  | "cancel_supplier_and_refund"
  | "retry_capture"
  | "confirm_purchased"
  | "confirm_not_placed"
  | "approve_refund"
  | "mark_resolved";

export const ACTION_LABELS: Record<ResolutionAction, string> = {
  retry_validation: "Re-run validation",
  retry_quote: "Request a new quote",
  retry_procurement: "Retry procurement (re-checks price and stock first)",
  offer_revised_quote: "Offer revised quote to customer (releases current authorization)",
  cancel_and_release: "Cancel order and release/refund payment",
  cancel_supplier_and_refund: "Cancel supplier order and refund customer",
  retry_capture: "Retry payment capture",
  confirm_purchased: "Confirm with supplier: order WAS placed",
  confirm_not_placed: "Confirm with supplier: order was NOT placed (allows retry)",
  approve_refund: "Approve refund",
  mark_resolved: "Mark resolved (record what was done)",
};

export interface RaiseOptions {
  orderId: string | null;
  kind: ExceptionKind;
  cause: string;
  evidence?: Record<string, unknown>;
  exposureCents?: number;
  actions: ResolutionAction[];
  urgent?: boolean;
  /** Hold the order in "exception" status until resolved. */
  holdsOrder?: boolean;
  actor?: string;
}

/** Record an exception (deduplicated per order+kind while open) and alert if urgent. */
export async function raiseException(q: Queryable, o: RaiseOptions): Promise<string> {
  if (o.orderId) {
    const existing = await q.query<{ id: string }>(`SELECT id FROM exceptions WHERE order_id = $1 AND kind = $2 AND status = 'open'`, [o.orderId, o.kind]);
    if (existing.rows[0]) return existing.rows[0].id;
  }
  const id = uuid();
  const holds = o.holdsOrder ?? true;
  await q.query(
    `INSERT INTO exceptions(id, order_id, kind, status, urgent, holds_order, cause, exposure_cents, evidence, actions)
     VALUES ($1,$2,$3,'open',$4,$5,$6,$7,$8,$9)`,
    [id, o.orderId, o.kind, !!o.urgent, holds, o.cause, o.exposureCents ?? 0, JSON.stringify(o.evidence ?? {}), JSON.stringify(o.actions)],
  );
  if (o.orderId && holds) {
    const { rows } = await q.query<{ status: string }>(`SELECT status FROM orders WHERE id = $1`, [o.orderId]);
    if (rows[0] && rows[0].status !== "exception" && !["canceled", "refunded"].includes(rows[0].status)) {
      await transition(q, o.orderId, "exception", `${o.kind}: ${o.cause}`, o.actor ?? "system");
    }
  }
  await audit(q, o.actor ?? "system", "exception.raise", "exception", id, { orderId: o.orderId, kind: o.kind, cause: o.cause, exposureCents: o.exposureCents ?? 0 });
  if (o.urgent) {
    await q.query(`INSERT INTO notifications(kind, channel, recipient, subject, body) VALUES ('urgent','log',$1,$2,$3)`, [
      env.alertEmail,
      `[BrickLoop URGENT] ${o.kind} on order ${o.orderId ?? "-"}`,
      `${o.cause}\nExposure: ${(o.exposureCents ?? 0) / 100} USD\nActions: ${o.actions.join(", ")}`,
    ]);
    log.warn(`URGENT exception ${o.kind} order=${o.orderId}: ${o.cause}`);
  }
  return id;
}

export interface ExceptionRow {
  id: string;
  order_id: string | null;
  kind: ExceptionKind;
  status: "open" | "resolved";
  urgent: boolean;
  holds_order: boolean;
  cause: string;
  exposure_cents: number;
  evidence: Record<string, unknown>;
  actions: ResolutionAction[];
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  owner_minutes: number | null;
  created_at: string;
}

export async function listExceptions(status: "open" | "resolved" | "all" = "open"): Promise<ExceptionRow[]> {
  const db = await getDb();
  const where = status === "all" ? "" : `WHERE status = '${status}'`;
  const { rows } = await db.query<ExceptionRow>(`SELECT * FROM exceptions ${where} ORDER BY urgent DESC, created_at DESC LIMIT 500`);
  return rows;
}

export async function markResolved(q: Queryable, id: string, resolution: string, actor: string, ownerMinutes: number | null) {
  await q.query(`UPDATE exceptions SET status = 'resolved', resolution = $2, resolved_by = $3, resolved_at = now(), owner_minutes = $4 WHERE id = $1`, [
    id,
    resolution,
    actor,
    ownerMinutes,
  ]);
  await audit(q, actor, "exception.resolve", "exception", id, { resolution, ownerMinutes });
}

/** Resolve all open exceptions for an order (used when the order reaches a terminal state). */
export async function resolveAllForOrder(q: Queryable, orderId: string, resolution: string, actor: string) {
  const { rows } = await q.query<{ id: string }>(`SELECT id FROM exceptions WHERE order_id = $1 AND status = 'open'`, [orderId]);
  for (const r of rows) await markResolved(q, r.id, resolution, actor, null);
}
