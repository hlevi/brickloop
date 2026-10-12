import { getDb } from "./db";

export async function adminOrders(limit = 200) {
  const db = await getDb();
  const { rows } = await db.query<{
    id: string;
    status: string;
    mode: string;
    created_at: string;
    accepted_total_cents: number | null;
    design_name: string;
    supplier_status: string | null;
    payment_status: string | null;
    open_exceptions: number;
  }>(
    `SELECT o.id, o.status, o.mode, o.created_at, o.accepted_total_cents, d.name AS design_name,
       (SELECT status FROM supplier_orders s WHERE s.order_id = o.id ORDER BY created_at DESC LIMIT 1) AS supplier_status,
       (SELECT status FROM payments p WHERE p.order_id = o.id ORDER BY created_at DESC LIMIT 1) AS payment_status,
       (SELECT COUNT(*)::int FROM exceptions e WHERE e.order_id = o.id AND e.status = 'open') AS open_exceptions
     FROM orders o JOIN designs d ON d.id = o.design_id ORDER BY o.created_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function recentNotifications(limit = 30) {
  const db = await getDb();
  const { rows } = await db.query<{ id: number; kind: string; recipient: string; subject: string; body: string; created_at: string }>(
    `SELECT id, kind, recipient, subject, body, created_at FROM notifications ORDER BY id DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function orderAudit(orderId: string) {
  const db = await getDb();
  const { rows } = await db.query<{ actor: string; action: string; data: unknown; at: string }>(
    `SELECT actor, action, data, at FROM audit_events WHERE entity_type = 'order' AND entity_id = $1 ORDER BY id`,
    [orderId],
  );
  return rows;
}
