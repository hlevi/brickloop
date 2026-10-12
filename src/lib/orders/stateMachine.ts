import type { Queryable } from "../db";
import { audit } from "../audit";
import { AppError } from "../util";

export const ORDER_STATUSES = [
  "draft",
  "validating",
  "quoting",
  "awaiting_acceptance",
  "payment_authorized",
  "procuring",
  "purchased",
  "shipped",
  "delivered",
  "exception",
  "canceled",
  "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ["validating", "canceled"],
  validating: ["quoting", "exception", "canceled"],
  quoting: ["awaiting_acceptance", "exception", "canceled"],
  awaiting_acceptance: ["payment_authorized", "quoting", "exception", "canceled"],
  payment_authorized: ["procuring", "exception", "canceled"],
  procuring: ["purchased", "exception", "payment_authorized"],
  purchased: ["shipped", "delivered", "exception", "canceled", "refunded"],
  shipped: ["delivered", "exception", "refunded"],
  delivered: ["exception", "refunded"],
  exception: ["validating", "quoting", "awaiting_acceptance", "payment_authorized", "procuring", "purchased", "shipped", "delivered", "canceled", "refunded"],
  canceled: [],
  refunded: [],
};

export const TERMINAL: OrderStatus[] = ["canceled", "refunded"];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export interface LockedOrder {
  id: string;
  status: OrderStatus;
  held_from_status: OrderStatus | null;
}

/** Lock the order row for the rest of the transaction. */
export async function lockOrder(q: Queryable, orderId: string): Promise<LockedOrder> {
  const { rows } = await q.query<LockedOrder>(`SELECT id, status, held_from_status FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
  if (!rows[0]) throw new AppError("not_found", "Order not found", 404);
  return rows[0];
}

/**
 * Move an order between states. Deterministic code is the only path that
 * changes order status; every change is recorded in history and the audit log.
 */
export async function transition(q: Queryable, orderId: string, to: OrderStatus, reason: string, actor: string, expectFrom?: OrderStatus[]): Promise<OrderStatus> {
  const o = await lockOrder(q, orderId);
  if (expectFrom && !expectFrom.includes(o.status)) {
    throw new AppError("invalid_state", `Order is ${o.status}; expected ${expectFrom.join(" or ")}`, 409);
  }
  if (o.status === to) return to;
  if (!canTransition(o.status, to)) throw new AppError("invalid_transition", `Cannot move order from ${o.status} to ${to}`, 409);
  const held = to === "exception" ? o.status : null;
  await q.query(
    `UPDATE orders SET status = $2, held_from_status = CASE WHEN $2 = 'exception' THEN $3 ELSE NULL END, updated_at = now() WHERE id = $1`,
    [orderId, to, held],
  );
  await q.query(`INSERT INTO order_status_history(order_id, from_status, to_status, reason, actor) VALUES ($1,$2,$3,$4,$5)`, [orderId, o.status, to, reason, actor]);
  await audit(q, actor, "order.transition", "order", orderId, { from: o.status, to, reason });
  return o.status;
}
