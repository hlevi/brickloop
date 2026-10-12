import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { enqueue } from "@/lib/jobs/queue";
import { SimulatorSupplier } from "@/lib/suppliers/simulator";
import { assertSameOrigin, readJson, requireAdmin, route } from "@/lib/http";
import { AppError, isUuid } from "@/lib/util";

/** Simulation only: move the simulated carrier clock forward for one order. */
export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  await requireAdmin();
  const b = await readJson(req);
  const orderId = String(b.orderId ?? "");
  const to = b.to === "delivered" ? "delivered" : "shipped";
  if (!isUuid(orderId)) throw new AppError("invalid", "orderId required");
  const db = await getDb();
  const so = await db.query<{ supplier_order_ref: string; mode: string }>(`SELECT supplier_order_ref, mode FROM supplier_orders WHERE order_id = $1 AND status = 'confirmed'`, [orderId]);
  if (!so.rows.length) throw new AppError("invalid", "No confirmed supplier order");
  if (so.rows.some((r) => r.mode !== "simulated")) throw new AppError("forbidden", "Only simulated orders can be advanced", 403);
  const sim = new SimulatorSupplier();
  for (const r of so.rows) await sim.fastForward(r.supplier_order_ref, to);
  await db.tx((q) => enqueue(q, "order.track", { orderId }, { dedupeKey: `track:${orderId}:advance:${Date.now()}`, maxAttempts: 10 }));
  return NextResponse.json({ ok: true });
});
