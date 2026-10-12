import { getDb } from "./db";

/** Pilot metrics. Quote requests are reported separately and are not treated as demand. */
export async function pilotMetrics() {
  const db = await getDb();
  const one = async <T>(sql: string): Promise<T> => (await db.query<T>(sql)).rows[0];
  const designs = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM designs`);
  const designsWithCheckout = await one<{ n: number }>(`SELECT COUNT(DISTINCT design_id)::int AS n FROM orders`);
  const quoteRequests = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM orders`);
  const paid = await one<{ n: number; sim: number }>(
    `SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE o.mode = 'simulated')::int AS sim FROM orders o WHERE EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.status IN ('captured','refunded'))`,
  );
  const delivered = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM orders WHERE status = 'delivered'`);
  const interventionFree = await one<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM orders o WHERE o.status = 'delivered' AND NOT EXISTS (SELECT 1 FROM exceptions e WHERE e.order_id = o.id)`,
  );
  const exceptions = await db.query<{ kind: string; open: number; total: number }>(
    `SELECT kind, COUNT(*) FILTER (WHERE status = 'open')::int AS open, COUNT(*)::int AS total FROM exceptions GROUP BY kind ORDER BY kind`,
  );
  const ownerMinutes = await one<{ total: number; orders: number }>(
    `SELECT COALESCE(SUM(owner_minutes),0)::int AS total, COUNT(DISTINCT order_id)::int AS orders FROM exceptions WHERE owner_minutes IS NOT NULL`,
  );
  const costs = await one<{ landed: number; revenue: number; contribution: number; n: number }>(
    `SELECT COALESCE(SUM(so.total_cents),0)::int AS landed, COALESCE(SUM(p.captured_cents - p.refunded_cents),0)::int AS revenue,
            COALESCE(SUM(q.contribution_cents),0)::int AS contribution, COUNT(DISTINCT o.id)::int AS n
     FROM orders o
     JOIN supplier_orders so ON so.order_id = o.id AND so.status = 'confirmed'
     LEFT JOIN payments p ON p.order_id = o.id AND p.status IN ('captured','refunded')
     LEFT JOIN quotes q ON q.id = o.accepted_quote_id`,
  );
  const delivery = await one<{ on_time: number; late: number }>(
    `SELECT COUNT(*) FILTER (WHERE delivered_at <= estimated_delivery_at)::int AS on_time, COUNT(*) FILTER (WHERE delivered_at > estimated_delivery_at)::int AS late
     FROM orders WHERE delivered_at IS NOT NULL`,
  );
  const complaints = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM complaints WHERE kind = 'missing_piece'`);
  const n = (v: unknown) => Number(v ?? 0);
  return {
    note: "Simulated orders are counted separately in spirit: no simulated order represents real demand or real costs.",
    designs: n(designs.n),
    quoteRequests: n(quoteRequests.n),
    designToCheckoutConversion: n(designs.n) ? n(designsWithCheckout.n) / n(designs.n) : null,
    paidOrders: n(paid.n),
    paidOrdersSimulated: n(paid.sim),
    deliveredOrders: n(delivered.n),
    interventionFreeRate: n(delivered.n) ? n(interventionFree.n) / n(delivered.n) : null,
    exceptions: exceptions.rows.map((r) => ({ kind: r.kind, open: n(r.open), total: n(r.total) })),
    ownerMinutesTotal: n(ownerMinutes.total),
    ownerMinutesPerOrder: n(quoteRequests.n) ? n(ownerMinutes.total) / n(quoteRequests.n) : null,
    landedCostCents: n(costs.landed),
    contributionPerOrderCents: n(costs.n) ? n(costs.contribution) / n(costs.n) : null,
    netRevenueCents: n(costs.revenue),
    deliveryOnTime: n(delivery.on_time),
    deliveryLate: n(delivery.late),
    missingPieceComplaints: n(complaints.n),
  };
}
