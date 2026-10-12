import { getDb } from "../db";
import { audit } from "../audit";
import { enqueue } from "../jobs/queue";

import { cancelSupplierOrders, releasePayments } from "../orders/workflow";
import { getOrderRow, notifyCustomer } from "../orders/service";
import { lockOrder, transition, type OrderStatus } from "../orders/stateMachine";
import { AppError, isUuid } from "../util";
import { markResolved, resolveAllForOrder, type ExceptionRow, type ResolutionAction } from "./service";

export interface ResolveInput {
  exceptionId: string;
  action: ResolutionAction;
  note?: string;
  ownerMinutes?: number | null;
}

/** Owner resolution of an exception. Only actions listed on the exception are allowed. */
export async function resolveException(input: ResolveInput, actor: string): Promise<{ message: string }> {
  if (!isUuid(input.exceptionId)) throw new AppError("not_found", "Exception not found", 404);
  const db = await getDb();
  const ex = (await db.query<ExceptionRow>(`SELECT * FROM exceptions WHERE id = $1`, [input.exceptionId])).rows[0];
  if (!ex) throw new AppError("not_found", "Exception not found", 404);
  if (ex.status !== "open") throw new AppError("already_resolved", "Exception already resolved", 409);
  if (!ex.actions.includes(input.action)) throw new AppError("action_not_allowed", `Action ${input.action} is not available for this exception`, 400);
  const minutes = input.ownerMinutes === undefined || input.ownerMinutes === null ? null : Math.max(0, Math.round(Number(input.ownerMinutes)));
  const note = (input.note ?? "").slice(0, 1000);
  const orderId = ex.order_id;
  const resolution = `${input.action}${note ? `: ${note}` : ""}`;

  if (input.action === "mark_resolved" && note.trim().length < 5) throw new AppError("note_required", "Describe what was done (at least 5 characters)");

  // Release a held order back to the state it was in, or to an explicit target.
  const release = async (to: OrderStatus | "held", reason: string, jobs: (q: Parameters<Parameters<typeof db.tx>[0]>[0]) => Promise<void> = async () => {}) => {
    await db.tx(async (q) => {
      if (orderId) {
        const o = await lockOrder(q, orderId);
        const target = to === "held" ? o.held_from_status : to;
        if (o.status === "exception" && target) await transition(q, orderId, target, reason, actor);
        else if (to !== "held" && o.status !== to) await transition(q, orderId, to, reason, actor);
      }
      await markResolved(q, ex.id, resolution, actor, minutes);
      await jobs(q);
    });
  };

  switch (input.action) {
    case "mark_resolved": {
      if (ex.holds_order) await release("held", `resolved: ${note}`);
      else await db.tx((q) => markResolved(q, ex.id, resolution, actor, minutes));
      return { message: "Marked resolved" };
    }
    case "retry_validation":
      await release("validating", "owner retried validation", async (q) => {
        await enqueue(q, "order.validate", { orderId }, { dedupeKey: `validate:${orderId}:${ex.id}` });
      });
      return { message: "Validation re-queued" };
    case "retry_quote":
      await release("quoting", "owner requested new quote", async (q) => {
        await enqueue(q, "order.quote", { orderId, purpose: "initial" }, { dedupeKey: `quote:${orderId}:${ex.id}` });
      });
      return { message: "New quote requested" };
    case "retry_procurement":
      await release("payment_authorized", "owner retried procurement", async (q) => {
        await q.query(`UPDATE orders SET procurement_attempts = 0 WHERE id = $1`, [orderId]);
        await enqueue(q, "order.procure", { orderId }, { dedupeKey: `procure:${orderId}:${ex.id}`, maxAttempts: 3 });
      });
      return { message: "Procurement re-queued (price and stock are re-checked first)" };
    case "retry_capture":
      await db.tx(async (q) => {
        await markResolved(q, ex.id, resolution, actor, minutes);
        await enqueue(q, "order.capture", { orderId }, { dedupeKey: `capture:${orderId}:${ex.id}`, maxAttempts: 4 });
      });
      return { message: "Capture re-queued" };
    case "offer_revised_quote": {
      if (!orderId) throw new AppError("invalid", "No order");
      // Release the current authorization; the customer must accept the new price explicitly.
      await releasePayments(orderId, actor);
      await release("quoting", "revised quote required after cost change", async (q) => {
        await q.query(`UPDATE orders SET accepted_quote_id = NULL, accepted_total_cents = NULL, procurement_attempts = 0 WHERE id = $1`, [orderId]);
        await enqueue(q, "order.quote", { orderId, purpose: "revised" }, { dedupeKey: `quote:${orderId}:revised:${ex.id}` });
        await notifyCustomer(q, orderId, "Price changed - your approval is needed", "The supplier's price changed. Your previous authorization was released. Please review the new quote.");
      });
      return { message: "Authorization released; a revised quote will be offered to the customer" };
    }
    case "cancel_and_release": {
      if (!orderId) throw new AppError("invalid", "No order");
      const o = await getOrderRow(orderId);
      const purchased = (await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM supplier_orders WHERE order_id = $1 AND status IN ('confirmed','partial','uncertain','submitting')`, [orderId])).rows[0];
      if (Number(purchased.n) > 0) throw new AppError("has_supplier_orders", "Supplier orders exist or are uncertain; use cancel_supplier_and_refund or reconcile first", 409);
      const r = await releasePayments(orderId, actor);
      await db.tx(async (q) => {
        await transition(q, orderId, r.refundedCents ? "refunded" : "canceled", `owner canceled (${ex.kind})`, actor);
        await markResolved(q, ex.id, resolution, actor, minutes);
        await resolveAllForOrder(q, orderId, "order canceled", actor);
        await notifyCustomer(q, orderId, "Order canceled", r.refundedCents ? "Your payment was refunded." : "Any payment authorization was released; you were not charged.");
      });
      return { message: `Order ${o.id} canceled` };
    }
    case "cancel_supplier_and_refund": {
      if (!orderId) throw new AppError("invalid", "No order");
      const failed = await cancelSupplierOrders(orderId, actor);
      if (failed.length) throw new AppError("supplier_cancel_failed", `Supplier cancellation failed: ${failed.join(", ")}. Resolve with the supplier, then mark resolved.`, 409);
      const r = await releasePayments(orderId, actor);
      await db.tx(async (q) => {
        await transition(q, orderId, r.refundedCents ? "refunded" : "canceled", `supplier order canceled (${ex.kind})`, actor);
        await markResolved(q, ex.id, resolution, actor, minutes);
        await resolveAllForOrder(q, orderId, "order canceled", actor);
        await notifyCustomer(q, orderId, "Order canceled", r.refundedCents ? "Your payment was refunded." : "Your authorization was released; you were not charged.");
      });
      return { message: "Supplier order canceled and payment released" };
    }
    case "approve_refund": {
      if (!orderId) throw new AppError("invalid", "No order");
      const r = await releasePayments(orderId, actor);
      await db.tx(async (q) => {
        await transition(q, orderId, r.refundedCents ? "refunded" : "canceled", "owner approved refund", actor);
        await markResolved(q, ex.id, resolution, actor, minutes);
        await resolveAllForOrder(q, orderId, "order refunded", actor);
        await notifyCustomer(q, orderId, "Refund issued", `Refunded ${(r.refundedCents / 100).toFixed(2)}.`);
      });
      return { message: "Refund issued" };
    }
    case "confirm_purchased": {
      if (!orderId) throw new AppError("invalid", "No order");
      const ref = note.trim();
      if (!ref) throw new AppError("note_required", "Enter the supplier order reference in the note");
      const soId = String((ex.evidence as { supplierOrderId?: string }).supplierOrderId ?? "");
      await db.tx(async (q) => {
        await q.query(`UPDATE supplier_orders SET status = 'confirmed', supplier_order_ref = $2, total_cents = COALESCE(total_cents, max_total_cents), updated_at = now() WHERE id = $1`, [soId, ref]);
        const o = await lockOrder(q, orderId);
        if (o.status === "exception" || o.status === "procuring") await transition(q, orderId, "purchased", "owner confirmed purchase with supplier", actor);
        await markResolved(q, ex.id, resolution, actor, minutes);
        await enqueue(q, "order.capture", { orderId }, { dedupeKey: `capture:${orderId}:${ex.id}`, maxAttempts: 4 });
        await enqueue(q, "order.track", { orderId }, { dedupeKey: `track:${orderId}:${ex.id}`, maxAttempts: 10 });
      });
      return { message: "Purchase confirmed; capture and tracking queued" };
    }
    case "confirm_not_placed": {
      if (!orderId) throw new AppError("invalid", "No order");
      const soId = String((ex.evidence as { supplierOrderId?: string }).supplierOrderId ?? "");
      await db.tx(async (q) => {
        await q.query(`UPDATE supplier_orders SET status = 'not_placed', updated_at = now() WHERE id = $1`, [soId]);
        await audit(q, actor, "procurement.not_placed_confirmed", "order", orderId, { supplierOrderId: soId });
      });
      await release("payment_authorized", "owner confirmed previous attempt not placed", async (q) => {
        await enqueue(q, "order.procure", { orderId }, { dedupeKey: `procure:${orderId}:${ex.id}`, maxAttempts: 3 });
      });
      return { message: "Recorded as not placed; procurement re-queued" };
    }
  }
}

