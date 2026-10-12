/**
 * Automated order workflow. Each step is a persistent job; deterministic code
 * enforces quantities, limits, states and purchase execution. Routine orders
 * flow without owner action; anything unusual becomes an explicit exception.
 */
import { getDb, type Queryable } from "../db";
import { audit } from "../audit";
import { env } from "../config";
import { raiseException, resolveAllForOrder } from "../exceptions/service";
import { enqueue, RetryLater, type JobHandler, type JobRow } from "../jobs/queue";
import { getPaymentProvider } from "../payments/simulated";
import { paymentFeeEstimate, serviceFee } from "../pricing/estimate";
import { log } from "../redact";
import { getSettings, type OperatingSettings } from "../settings";
import { getSupplier } from "../suppliers/registry";
import {
  SupplierAmbiguousError,
  SupplierRejectedError,
  UnsupportedOperationError,
  type PurchaseResult,
  type QuoteRequestLine,
  type SupplierQuote,
} from "../suppliers/types";
import { uuid } from "../util";
import { formatCents as usd } from "../format";
import { physicallyValidatedKeys } from "../validation/physical";
import { validateModel } from "../validation/validate";
import { getOrderRow, notifyCustomer, type OrderRow, type QuoteRow } from "./service";
import { lockOrder, transition } from "./stateMachine";

const SYSTEM = "system";

function requestLines(o: OrderRow): QuoteRequestLine[] {
  return o.frozen_bom.lines.map((l) => ({
    partId: l.partId,
    colorId: l.colorId,
    quantity: l.quantity,
    externalItemId: l.mapping.externalItemId,
    externalColorId: l.mapping.externalColorId,
  }));
}

/** Verify a supplier quote matches the frozen parts list exactly (part, color, quantity, condition, stock). */
export function verifyQuoteAgainstBom(o: OrderRow, quote: SupplierQuote, condition: "N" | "U"): string[] {
  const issues = [...quote.issues];
  const want = new Map(o.frozen_bom.lines.map((l) => [`${l.partId}|${l.colorId}`, l.quantity]));
  const got = new Map(quote.lines.map((l) => [`${l.partId}|${l.colorId}`, l]));
  for (const [k, qty] of want) {
    const g = got.get(k);
    if (!g) issues.push(`${k}: missing from quote`);
    else {
      if (g.quantity !== qty) issues.push(`${k}: quoted ${g.quantity}, need ${qty}`);
      if (g.condition !== condition) issues.push(`${k}: condition ${g.condition}, need ${condition}`);
      if (!g.matched || g.available < qty) issues.push(`${k}: not available in full`);
    }
  }
  for (const k of got.keys()) if (!want.has(k)) issues.push(`${k}: not in parts list (no substitutions allowed)`);
  if (new Date(quote.expiresAt).getTime() <= Date.now()) issues.push("quote already expired");
  return [...new Set(issues)];
}

async function storeQuote(q: Queryable, o: OrderRow, sq: SupplierQuote, purpose: "initial" | "recheck" | "revised", s: OperatingSettings, issues: string[]): Promise<QuoteRow> {
  const fee = serviceFee(sq.totalCents, s);
  const customerTotal = sq.totalCents + fee;
  const payFee = paymentFeeEstimate(customerTotal);
  const id = uuid();
  const status = purpose === "recheck" ? "superseded" : issues.length ? "rejected" : "active";
  if (status === "active") await q.query(`UPDATE quotes SET status = 'superseded' WHERE order_id = $1 AND status = 'active'`, [o.id]);
  const { rows } = await q.query<QuoteRow>(
    `INSERT INTO quotes(id, order_id, supplier, mode, status, purpose, complete, issues, lines, condition, parts_cents, picking_cents, packaging_cents, shipping_cents, tax_cents,
       supplier_total_cents, service_fee_cents, customer_total_cents, payment_fee_estimate_cents, contribution_cents, currency, delivery_days_min, delivery_days_max, supplier_quote_ref, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING *`,
    [
      id,
      o.id,
      o.supplier,
      o.mode,
      status,
      purpose,
      issues.length === 0,
      JSON.stringify(issues),
      JSON.stringify(sq.lines),
      s.condition,
      sq.partsCents,
      sq.pickingCents,
      sq.packagingCents,
      sq.shippingCents,
      sq.taxCents,
      sq.totalCents,
      fee,
      customerTotal,
      payFee,
      fee - payFee,
      sq.currency,
      sq.deliveryDaysMin,
      sq.deliveryDaysMax,
      sq.ref,
      sq.expiresAt,
    ],
  );
  return rows[0];
}

/* ------------------------------------------------------------------ validate */

const validateHandler: JobHandler = async (job) => {
  const orderId = String(job.payload.orderId);
  const db = await getDb();
  const o = await getOrderRow(orderId);
  if (o.status !== "validating") return;
  // Re-run validation on the frozen model; never trust the stored result alone.
  const v = validateModel(o.frozen_model, physicallyValidatedKeys());
  await db.tx(async (q) => {
    await q.query(`UPDATE orders SET frozen_validation = $2 WHERE id = $1`, [orderId, JSON.stringify(v)]);
    if (v.status !== "valid") {
      await raiseException(q, {
        orderId,
        kind: "validation_failed",
        cause: `Design failed digital validation: ${v.errors.map((e) => e.message).slice(0, 3).join("; ")}`,
        evidence: { errors: v.errors, structuralKey: v.structuralKey },
        actions: ["cancel_and_release", "retry_validation"],
      });
      return;
    }
    if (o.mode === "live") {
      if (!v.physicallyValidated) {
        await raiseException(q, {
          orderId,
          kind: "unvalidated_design",
          cause: `Configuration ${v.structuralKey} has not been physically validated; live orders require a test build.`,
          evidence: { structuralKey: v.structuralKey },
          actions: ["cancel_and_release", "retry_validation"],
        });
        return;
      }
      if (!o.frozen_bom.liveSourcingReady) {
        await raiseException(q, {
          orderId,
          kind: "unresolved_parts",
          cause: `${o.frozen_bom.unresolved.length} part/color line(s) lack a verified supplier mapping; live sourcing is blocked.`,
          evidence: { unresolved: o.frozen_bom.unresolved.map((l) => `${l.partId}/${l.colorId}`) },
          actions: ["cancel_and_release", "retry_validation"],
        });
        return;
      }
    }
    await transition(q, orderId, "quoting", "design validated", SYSTEM);
    await enqueue(q, "order.quote", { orderId, purpose: "initial" }, { dedupeKey: `quote:${orderId}:${job.id}` });
  });
};

/* --------------------------------------------------------------------- quote */

const quoteHandler: JobHandler = async (job) => {
  const orderId = String(job.payload.orderId);
  const o = await getOrderRow(orderId);
  if (o.status !== "quoting") return;
  const s = await getSettings();
  const supplier = getSupplier(o.supplier);
  let sq: SupplierQuote;
  try {
    sq = await supplier.quote({ lines: requestLines(o), condition: s.condition, shipTo: o.contact.shipTo, ttlMinutes: s.quoteTtlMinutes });
  } catch (e) {
    if (e instanceof UnsupportedOperationError) {
      const db = await getDb();
      await db.tx((q) => raiseException(q, { orderId, kind: "supplier_failure", cause: e.message, actions: ["cancel_and_release", "retry_quote"] }));
      return;
    }
    throw e; // transient: retried with backoff by the queue
  }
  const issues = verifyQuoteAgainstBom(o, sq, s.condition);
  const db = await getDb();
  await db.tx(async (q) => {
    await lockOrder(q, orderId);
    const quote = await storeQuote(q, o, sq, "initial", s, issues);
    if (issues.length) {
      await raiseException(q, {
        orderId,
        kind: "quote_incomplete",
        cause: `Supplier cannot supply the exact parts list: ${issues.slice(0, 3).join("; ")}`,
        evidence: { quoteId: quote.id, issues },
        actions: ["retry_quote", "cancel_and_release"],
      });
      return;
    }
    if (quote.supplier_total_cents > s.maxOrderSupplierCents) {
      await raiseException(q, {
        orderId,
        kind: "limit_exceeded",
        cause: `Supplier cost ${usd(quote.supplier_total_cents)} exceeds the per-order limit ${usd(s.maxOrderSupplierCents)}.`,
        evidence: { quoteId: quote.id, supplierTotal: quote.supplier_total_cents, limit: s.maxOrderSupplierCents },
        actions: ["retry_quote", "cancel_and_release"],
      });
      return;
    }
    if (quote.contribution_cents < s.minContributionCents) {
      await raiseException(q, {
        orderId,
        kind: "contribution_below_minimum",
        cause: `Contribution ${usd(quote.contribution_cents)} is below the minimum ${usd(s.minContributionCents)}.`,
        evidence: { quoteId: quote.id, contribution: quote.contribution_cents },
        actions: ["retry_quote", "cancel_and_release"],
      });
      return;
    }
    await transition(q, orderId, "awaiting_acceptance", "complete supplier quote obtained", SYSTEM);
    await notifyCustomer(q, orderId, "Your quote is ready", `Total ${(quote.customer_total_cents / 100).toFixed(2)} ${quote.currency}, valid until ${quote.expires_at}.`);
  });
};

/* ------------------------------------------------------------------- procure */

async function dailySpend(q: Queryable): Promise<number> {
  const { rows } = await q.query<{ n: number }>(
    `SELECT COALESCE(SUM(COALESCE(total_cents, max_total_cents)), 0)::int AS n FROM supplier_orders
     WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND status IN ('submitting','confirmed','partial','uncertain')`,
  );
  return Number(rows[0].n);
}

const procureHandler: JobHandler = async (job) => {
  const orderId = String(job.payload.orderId);
  const s = await getSettings();
  if (s.purchasingPaused) throw new RetryLater(60, "purchasing paused by owner");
  let o = await getOrderRow(orderId);
  if (o.status !== "payment_authorized") return;
  const supplier = getSupplier(o.supplier); // allowlist enforced here as well
  const db = await getDb();
  const accepted = (await db.query<QuoteRow>(`SELECT * FROM quotes WHERE id = $1`, [o.accepted_quote_id])).rows[0];
  const payment = (await db.query<{ id: string; auth_expires_at: string; status: string }>(`SELECT id, auth_expires_at, status FROM payments WHERE order_id = $1 AND status = 'authorized' ORDER BY created_at DESC LIMIT 1`, [orderId])).rows[0];
  if (!accepted || !payment) {
    await db.tx((q) => raiseException(q, { orderId, kind: "payment_failed", cause: "No active payment authorization or accepted quote", actions: ["cancel_and_release"], urgent: true }));
    return;
  }
  const hoursLeft = (new Date(payment.auth_expires_at).getTime() - Date.now()) / 3600_000;
  if (hoursLeft < 24) {
    await db.tx((q) =>
      raiseException(q, { orderId, kind: "auth_expiring", cause: `Payment authorization expires in ${hoursLeft.toFixed(1)}h; purchasing now could leave cost uncaptured.`, actions: ["offer_revised_quote", "cancel_and_release"], urgent: true }),
    );
    return;
  }
  if (!supplier.info.capabilities.purchase || !supplier.info.capabilities.quote) {
    await db.tx((q) => raiseException(q, { orderId, kind: "supplier_failure", cause: `Supplier ${supplier.info.id} cannot quote and purchase`, actions: ["cancel_and_release"] }));
    return;
  }

  // Recheck availability and landed cost immediately before buying.
  const recheck = await supplier.quote({ lines: requestLines(o), condition: s.condition, shipTo: o.contact.shipTo, ttlMinutes: s.quoteTtlMinutes });
  const issues = verifyQuoteAgainstBom(o, recheck, s.condition);

  const decision = await db.tx(async (q) => {
    const locked = await lockOrder(q, orderId);
    if (locked.status !== "payment_authorized") return { go: false as const };
    const rq = await storeQuote(q, o, recheck, "recheck", s, issues);
    if (issues.length) {
      await raiseException(q, {
        orderId,
        kind: "quote_changed",
        cause: `Stock changed since acceptance: ${issues.slice(0, 3).join("; ")}`,
        evidence: { acceptedQuoteId: accepted.id, recheckQuoteId: rq.id, issues },
        actions: ["retry_procurement", "offer_revised_quote", "cancel_and_release"],
      });
      return { go: false as const };
    }
    if (recheck.totalCents > accepted.supplier_total_cents) {
      await raiseException(q, {
        orderId,
        kind: "quote_changed",
        cause: `Supplier cost rose from ${usd(accepted.supplier_total_cents)} to ${usd(recheck.totalCents)} after acceptance. The customer will not be charged more without a new acceptance.`,
        evidence: { acceptedQuoteId: accepted.id, recheckQuoteId: rq.id, accepted: accepted.supplier_total_cents, now: recheck.totalCents },
        actions: ["offer_revised_quote", "cancel_and_release", "retry_procurement"],
      });
      return { go: false as const };
    }
    if (recheck.totalCents > s.maxOrderSupplierCents) {
      await raiseException(q, { orderId, kind: "limit_exceeded", cause: `Supplier cost ${usd(recheck.totalCents)} exceeds per-order limit ${usd(s.maxOrderSupplierCents)}`, evidence: { limit: s.maxOrderSupplierCents }, actions: ["retry_procurement", "cancel_and_release"] });
      return { go: false as const };
    }
    const spent = await dailySpend(q);
    if (spent + recheck.totalCents > s.dailySpendLimitCents) {
      await raiseException(q, {
        orderId,
        kind: "limit_exceeded",
        cause: `Daily supplier spend would reach ${usd(spent + recheck.totalCents)} (limit ${usd(s.dailySpendLimitCents)}).`,
        evidence: { spentToday: spent, limit: s.dailySpendLimitCents },
        actions: ["retry_procurement", "cancel_and_release"],
      });
      return { go: false as const };
    }
    const attempt = o.procurement_attempts + 1;
    if (attempt > s.maxProcurementAttempts) {
      await raiseException(q, { orderId, kind: "supplier_failure", cause: `Procurement attempts exhausted (${o.procurement_attempts}).`, actions: ["retry_procurement", "cancel_and_release"], urgent: true });
      return { go: false as const };
    }
    await transition(q, orderId, "procuring", `procurement attempt ${attempt}`, SYSTEM);
    await q.query(`UPDATE orders SET procurement_attempts = $2 WHERE id = $1`, [orderId, attempt]);
    const soId = uuid();
    const key = `${orderId}:${attempt}`;
    // Persist intent BEFORE calling the supplier so an ambiguous outcome is never lost.
    await q.query(
      `INSERT INTO supplier_orders(id, order_id, supplier, mode, attempt, idempotency_key, status, requested_lines, max_total_cents) VALUES ($1,$2,$3,$4,$5,$6,'submitting',$7,$8)`,
      [soId, orderId, o.supplier, o.mode, attempt, key, JSON.stringify(requestLines(o)), recheck.totalCents],
    );
    await audit(q, SYSTEM, "procurement.submit", "order", orderId, { supplierOrderId: soId, attempt, maxTotalCents: recheck.totalCents });
    return { go: true as const, soId, key, maxTotal: recheck.totalCents };
  });
  if (!decision.go) return;

  o = await getOrderRow(orderId);
  try {
    const result = await supplier.purchase({ clientReference: decision.key, lines: requestLines(o), condition: s.condition, maxTotalCents: decision.maxTotal, shipTo: o.contact.shipTo });
    await recordPurchase(orderId, decision.soId, result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof SupplierAmbiguousError) {
      await db.tx(async (q) => {
        await q.query(`UPDATE supplier_orders SET status = 'uncertain', last_error = $2, updated_at = now() WHERE id = $1`, [decision.soId, msg]);
        await audit(q, SYSTEM, "procurement.uncertain", "order", orderId, { supplierOrderId: decision.soId, error: msg });
        await enqueue(q, "order.reconcile", { orderId, supplierOrderId: decision.soId, lookups: 0 }, { dedupeKey: `reconcile:${decision.soId}`, delaySeconds: 5 });
      });
      return;
    }
    if (e instanceof SupplierRejectedError) {
      await db.tx(async (q) => {
        await q.query(`UPDATE supplier_orders SET status = 'failed', last_error = $2, updated_at = now() WHERE id = $1`, [decision.soId, msg]);
        await transition(q, orderId, "payment_authorized", `supplier rejected attempt: ${msg}`, SYSTEM);
        if (o.procurement_attempts >= s.maxProcurementAttempts) {
          await raiseException(q, { orderId, kind: "supplier_failure", cause: `Supplier rejected the order ${o.procurement_attempts} time(s): ${msg}`, actions: ["retry_procurement", "cancel_and_release"], urgent: true });
        } else {
          await enqueue(q, "order.procure", { orderId }, { dedupeKey: `procure:${orderId}:retry:${o.procurement_attempts}`, delaySeconds: 10 * o.procurement_attempts, maxAttempts: 3 });
        }
      });
      return;
    }
    // Anything else after sending is treated as ambiguous: reconcile, never blindly retry.
    await db.tx(async (q) => {
      await q.query(`UPDATE supplier_orders SET status = 'uncertain', last_error = $2, updated_at = now() WHERE id = $1`, [decision.soId, msg]);
      await enqueue(q, "order.reconcile", { orderId, supplierOrderId: decision.soId, lookups: 0 }, { dedupeKey: `reconcile:${decision.soId}`, delaySeconds: 5 });
    });
  }
};

async function recordPurchase(orderId: string, soId: string, result: PurchaseResult) {
  const db = await getDb();
  await db.tx(async (q) => {
    await q.query(
      `UPDATE supplier_orders SET status = $2, supplier_order_ref = $3, total_cents = $4, purchased_lines = $5, failed_lines = $6, last_error = NULL, updated_at = now() WHERE id = $1`,
      [soId, result.status, result.supplierOrderRef, result.totalCents, JSON.stringify(result.purchasedLines), JSON.stringify(result.failedLines)],
    );
    await audit(q, SYSTEM, `procurement.${result.status}`, "order", orderId, { supplierOrderId: soId, ref: result.supplierOrderRef, totalCents: result.totalCents });
    if (result.status === "partial") {
      await raiseException(q, {
        orderId,
        kind: "partial_procurement",
        cause: `Supplier filled ${result.purchasedLines.length} of ${result.purchasedLines.length + result.failedLines.length} lines. Customer has not been charged.`,
        exposureCents: result.totalCents,
        evidence: { supplierOrderRef: result.supplierOrderRef, failedLines: result.failedLines },
        actions: ["cancel_supplier_and_refund", "mark_resolved"],
        urgent: true,
      });
      return;
    }
    await transition(q, orderId, "purchased", `supplier order ${result.supplierOrderRef} confirmed`, SYSTEM);
    await enqueue(q, "order.capture", { orderId }, { dedupeKey: `capture:${orderId}`, maxAttempts: 4 });
    await enqueue(q, "order.track", { orderId }, { dedupeKey: `track:${orderId}`, delaySeconds: 5, maxAttempts: 10 });
    await notifyCustomer(q, orderId, "Parts purchased", `Your parts are ordered. Building instructions: ${env.baseUrl}/orders/${orderId}`);
  });
}

/* ----------------------------------------------------------------- reconcile */

const reconcileHandler: JobHandler = async (job) => {
  const orderId = String(job.payload.orderId);
  const soId = String(job.payload.supplierOrderId);
  const lookups = Number(job.payload.lookups ?? 0);
  const db = await getDb();
  const so = (await db.query<{ idempotency_key: string; status: string; max_total_cents: number }>(`SELECT idempotency_key, status, max_total_cents FROM supplier_orders WHERE id = $1`, [soId])).rows[0];
  if (!so || so.status !== "uncertain") return;
  const o = await getOrderRow(orderId);
  const supplier = getSupplier(o.supplier);
  if (!supplier.info.capabilities.lookupOrder) {
    await db.tx((q) =>
      raiseException(q, {
        orderId,
        kind: "uncertain_purchase",
        cause: "Purchase outcome unknown and the supplier cannot be queried. Confirm directly with the supplier before any retry.",
        exposureCents: so.max_total_cents,
        evidence: { supplierOrderId: soId, clientReference: so.idempotency_key },
        actions: ["confirm_purchased", "confirm_not_placed"],
        urgent: true,
      }),
    );
    return;
  }
  const found = await supplier.lookupOrder(so.idempotency_key);
  if (found.found) {
    await recordPurchase(orderId, soId, {
      status: found.status === "partial" ? "partial" : "confirmed",
      supplierOrderRef: found.supplierOrderRef,
      totalCents: found.totalCents,
      purchasedLines: found.purchasedLines,
      failedLines: found.failedLines,
    });
    return;
  }
  if (lookups < 1) {
    // Allow for supplier-side propagation delay before concluding "not placed".
    await db.tx((q) => enqueue(q, "order.reconcile", { orderId, supplierOrderId: soId, lookups: lookups + 1 }, { dedupeKey: `reconcile:${soId}:${lookups + 1}`, delaySeconds: 10 }));
    return;
  }
  const s = await getSettings();
  await db.tx(async (q) => {
    await q.query(`UPDATE supplier_orders SET status = 'not_placed', updated_at = now() WHERE id = $1`, [soId]);
    await audit(q, SYSTEM, "procurement.not_placed", "order", orderId, { supplierOrderId: soId, lookups: lookups + 1 });
    await transition(q, orderId, "payment_authorized", "reconciled: previous attempt was not placed", SYSTEM);
    if (o.procurement_attempts >= s.maxProcurementAttempts) {
      await raiseException(q, { orderId, kind: "supplier_failure", cause: "Procurement attempts exhausted after timeouts", actions: ["retry_procurement", "cancel_and_release"], urgent: true });
    } else {
      await enqueue(q, "order.procure", { orderId }, { dedupeKey: `procure:${orderId}:after:${soId}`, maxAttempts: 3 });
    }
  });
};

/* ------------------------------------------------------------------- capture */

const captureHandler: JobHandler = async (job) => {
  const orderId = String(job.payload.orderId);
  const db = await getDb();
  const o = await getOrderRow(orderId);
  const pay = (await db.query<{ id: string; provider_ref: string; status: string; amount_cents: number }>(`SELECT id, provider_ref, status, amount_cents FROM payments WHERE order_id = $1 AND status IN ('authorized','captured') ORDER BY created_at DESC LIMIT 1`, [orderId])).rows[0];
  if (!pay || pay.status === "captured") return;
  const confirmed = (await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM supplier_orders WHERE order_id = $1 AND status = 'confirmed'`, [orderId])).rows[0];
  if (!Number(confirmed.n)) return; // only capture against confirmed procurement
  const amount = Math.min(o.accepted_total_cents ?? pay.amount_cents, pay.amount_cents); // never more than accepted
  const provider = getPaymentProvider();
  const key = `capture:${pay.id}`;
  await db.query(`INSERT INTO payment_operations(payment_id, op, idempotency_key, status, amount_cents) VALUES ($1,'capture',$2,'pending',$3) ON CONFLICT (idempotency_key) DO NOTHING`, [pay.id, key, amount]);
  const r = await provider.capture(pay.provider_ref, amount, key); // throws -> retried with backoff, dead -> exception
  await db.tx(async (q) => {
    await q.query(`UPDATE payments SET status = 'captured', captured_cents = $2, updated_at = now() WHERE id = $1`, [pay.id, r.capturedCents]);
    await q.query(`UPDATE payment_operations SET status = 'succeeded', result = $2 WHERE idempotency_key = $1`, [key, JSON.stringify(r)]);
    await audit(q, SYSTEM, "payment.captured", "order", orderId, { amount: r.capturedCents });
  });
};

/* --------------------------------------------------------------------- track */

const TRACK_POLL_SECONDS = Number(process.env.TRACK_POLL_SECONDS || 20);

const trackHandler: JobHandler = async (job) => {
  const orderId = String(job.payload.orderId);
  const db = await getDb();
  const o = await getOrderRow(orderId);
  if (!["purchased", "shipped"].includes(o.status)) return;
  const supplier = getSupplier(o.supplier);
  if (!supplier.info.capabilities.tracking) return;
  const so = (await db.query<{ id: string; supplier_order_ref: string; shipping_status: string | null }>(`SELECT id, supplier_order_ref, shipping_status FROM supplier_orders WHERE order_id = $1 AND status = 'confirmed' ORDER BY created_at DESC LIMIT 1`, [orderId])).rows[0];
  if (!so) return;
  const t = await supplier.getTracking(so.supplier_order_ref);
  await db.tx(async (q) => {
    await q.query(`UPDATE supplier_orders SET shipping_status = $2, carrier = $3, tracking_number = $4, tracking_events = $5, updated_at = now() WHERE id = $1`, [
      so.id,
      t.status,
      t.carrier,
      t.trackingNumber,
      JSON.stringify(t.events),
    ]);
    const cur = await lockOrder(q, orderId);
    if ((t.status === "shipped" || t.status === "delivered") && cur.status === "purchased") {
      await transition(q, orderId, "shipped", `carrier ${t.carrier} tracking ${t.trackingNumber}`, SYSTEM);
      await notifyCustomer(q, orderId, "Shipped", `Tracking: ${t.carrier} ${t.trackingNumber}`);
    }
    if (t.status === "delivered") {
      await transition(q, orderId, "delivered", "carrier confirmed delivery", SYSTEM);
      await q.query(`UPDATE orders SET delivered_at = now() WHERE id = $1`, [orderId]);
      await notifyCustomer(q, orderId, "Delivered", "Your parts were delivered. Enjoy the build!");
    }
  });
  if (t.status !== "delivered" && t.status !== "canceled") throw new RetryLater(TRACK_POLL_SECONDS, `tracking: ${t.status}`);
};

/* ---------------------------------------------------- cancellation & voiding */

const voidHandler: JobHandler = async (job) => {
  const paymentId = String(job.payload.paymentId);
  const db = await getDb();
  const p = (await db.query<{ provider_ref: string; status: string; order_id: string }>(`SELECT provider_ref, status, order_id FROM payments WHERE id = $1`, [paymentId])).rows[0];
  if (!p || p.status !== "authorized") return;
  await getPaymentProvider().void(p.provider_ref, `void:${paymentId}`);
  await db.tx(async (q) => {
    await q.query(`UPDATE payments SET status = 'voided', updated_at = now() WHERE id = $1`, [paymentId]);
    await audit(q, SYSTEM, "payment.voided", "order", p.order_id, { paymentId });
  });
};

/** Refund (if captured) or void (if authorized) every payment on an order. */
export async function releasePayments(orderId: string, actor: string): Promise<{ refundedCents: number; voided: number }> {
  const db = await getDb();
  const provider = getPaymentProvider();
  const pays = (await db.query<{ id: string; provider_ref: string; status: string; captured_cents: number; refunded_cents: number }>(`SELECT id, provider_ref, status, captured_cents, refunded_cents FROM payments WHERE order_id = $1 AND status IN ('authorized','captured')`, [orderId])).rows;
  let refundedCents = 0;
  let voided = 0;
  for (const p of pays) {
    if (p.status === "authorized") {
      await provider.void(p.provider_ref, `void:${p.id}`);
      await db.query(`UPDATE payments SET status = 'voided', updated_at = now() WHERE id = $1`, [p.id]);
      voided++;
    } else {
      const amount = p.captured_cents - p.refunded_cents;
      if (amount > 0) {
        const key = `refund:${p.id}:${p.refunded_cents}`;
        await db.query(`INSERT INTO payment_operations(payment_id, op, idempotency_key, status, amount_cents) VALUES ($1,'refund',$2,'pending',$3) ON CONFLICT (idempotency_key) DO NOTHING`, [p.id, key, amount]);
        await provider.refund(p.provider_ref, amount, key);
        await db.query(`UPDATE payment_operations SET status = 'succeeded' WHERE idempotency_key = $1`, [key]);
        await db.query(`UPDATE payments SET status = 'refunded', refunded_cents = refunded_cents + $2, updated_at = now() WHERE id = $1`, [p.id, amount]);
        refundedCents += amount;
      }
    }
  }
  await db.tx((q) => audit(q, actor, "payment.release", "order", orderId, { refundedCents, voided }));
  return { refundedCents, voided };
}

/** Cancel confirmed/partial supplier orders. Returns refs that could not be canceled. */
export async function cancelSupplierOrders(orderId: string, actor: string): Promise<string[]> {
  const db = await getDb();
  const o = await getOrderRow(orderId);
  const supplier = getSupplier(o.supplier);
  const sos = (await db.query<{ id: string; supplier_order_ref: string }>(`SELECT id, supplier_order_ref FROM supplier_orders WHERE order_id = $1 AND status IN ('confirmed','partial')`, [orderId])).rows;
  const failed: string[] = [];
  for (const so of sos) {
    if (!supplier.info.capabilities.cancel) {
      failed.push(`${so.supplier_order_ref} (supplier cannot cancel via integration)`);
      continue;
    }
    const r = await supplier.cancel(so.supplier_order_ref);
    if (r.canceled) {
      await db.query(`UPDATE supplier_orders SET status = 'canceled', updated_at = now() WHERE id = $1`, [so.id]);
    } else failed.push(`${so.supplier_order_ref} (${r.reason ?? "refused"})`);
  }
  await db.tx((q) => audit(q, actor, "procurement.cancel", "order", orderId, { failed }));
  return failed;
}

const cancelPurchasedHandler: JobHandler = async (job) => {
  const orderId = String(job.payload.orderId);
  const o = await getOrderRow(orderId);
  if (o.status !== "purchased") return;
  const db = await getDb();
  const failed = await cancelSupplierOrders(orderId, SYSTEM);
  if (failed.length) {
    await db.tx((q) =>
      raiseException(q, {
        orderId,
        kind: "cancellation_request",
        cause: `Customer asked to cancel; supplier cancellation failed: ${failed.join(", ")}`,
        actions: ["approve_refund", "mark_resolved"],
        holdsOrder: false,
      }),
    );
    return;
  }
  const r = await releasePayments(orderId, SYSTEM);
  await db.tx(async (q) => {
    await transition(q, orderId, r.refundedCents > 0 ? "refunded" : "canceled", "customer cancellation; supplier order canceled", SYSTEM);
    await resolveAllForOrder(q, orderId, "order canceled", SYSTEM);
    await notifyCustomer(q, orderId, "Order canceled", r.refundedCents > 0 ? `Refunded ${(r.refundedCents / 100).toFixed(2)}.` : "Your authorization was released; you were not charged.");
  });
};

/* -------------------------------------------------------------------- sweeps */

const sweepHandler: JobHandler = async () => {
  const db = await getDb();
  const s = await getSettings();
  // Expire stale quotes awaiting acceptance (customer is asked to refresh).
  await db.query(`UPDATE quotes SET status = 'expired' WHERE status = 'active' AND expires_at <= now()`);
  // Delivery delays (informational; does not hold the order).
  const late = await db.query<{ id: string; estimated_delivery_at: string }>(
    `SELECT id, estimated_delivery_at FROM orders WHERE status IN ('purchased','shipped') AND estimated_delivery_at IS NOT NULL
     AND estimated_delivery_at + ($1 || ' days')::interval < now()`,
    [String(s.deliveryGraceDays)],
  );
  for (const o of late.rows) {
    await db.tx((q) =>
      raiseException(q, {
        orderId: o.id,
        kind: "delivery_delayed",
        cause: `Not delivered ${s.deliveryGraceDays} day(s) after the latest estimate (${o.estimated_delivery_at}).`,
        actions: ["mark_resolved", "approve_refund"],
        holdsOrder: false,
      }),
    );
  }
  // Authorizations ageing without capture (e.g. stuck procurement).
  const aging = await db.query<{ order_id: string; created_at: string }>(
    `SELECT p.order_id, p.created_at FROM payments p JOIN orders o ON o.id = p.order_id
     WHERE p.status = 'authorized' AND o.status NOT IN ('canceled','refunded') AND p.created_at < now() - ($1 || ' hours')::interval`,
    [String(s.authEscalateAfterHours)],
  );
  for (const a of aging.rows) {
    await db.tx((q) =>
      raiseException(q, {
        orderId: a.order_id,
        kind: "auth_expiring",
        cause: `Payment authorized at ${a.created_at} is still not captured; the authorization window is closing.`,
        actions: ["retry_capture", "cancel_and_release", "mark_resolved"],
        urgent: true,
        holdsOrder: false,
      }),
    );
  }
  // Digest of open, non-urgent exceptions.
  const last = (await db.query<{ value: { at: string } }>(`SELECT value FROM settings WHERE key = 'digest_last'`)).rows[0]?.value?.at;
  if (!last || Date.now() - new Date(last).getTime() >= s.digestIntervalHours * 3600_000) {
    const open = await db.query<{ kind: string; n: number }>(`SELECT kind, COUNT(*)::int AS n FROM exceptions WHERE status = 'open' GROUP BY kind ORDER BY kind`);
    if (open.rows.length) {
      await db.query(`INSERT INTO notifications(kind, channel, recipient, subject, body) VALUES ('digest','log',$1,$2,$3)`, [
        env.alertEmail,
        `[BrickLoop] ${open.rows.reduce((n, r) => n + Number(r.n), 0)} open exception(s)`,
        open.rows.map((r) => `${r.kind}: ${r.n}`).join("\n"),
      ]);
    }
    await db.query(
      `INSERT INTO settings(key, value) VALUES ('digest_last', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify({ at: new Date().toISOString() })],
    );
  }
};

/** When a job exhausts its retries, surface it as an exception tied to its order. */
export async function onDeadJob(job: JobRow, error: string) {
  const orderId = typeof job.payload.orderId === "string" ? job.payload.orderId : null;
  const db = await getDb();
  const map: Record<string, { kind: Parameters<typeof raiseException>[1]["kind"]; actions: Parameters<typeof raiseException>[1]["actions"]; urgent: boolean }> = {
    "order.capture": { kind: "capture_failed", actions: ["retry_capture", "mark_resolved"], urgent: true },
    "order.procure": { kind: "supplier_failure", actions: ["retry_procurement", "cancel_and_release"], urgent: true },
    "order.quote": { kind: "supplier_failure", actions: ["retry_quote", "cancel_and_release"], urgent: false },
    "order.reconcile": { kind: "uncertain_purchase", actions: ["confirm_purchased", "confirm_not_placed"], urgent: true },
  };
  const m = map[job.type] ?? { kind: "job_failed" as const, actions: ["mark_resolved" as const], urgent: false };
  let exposure = 0;
  if (orderId && job.type === "order.capture") {
    const r = await db.query<{ n: number }>(`SELECT COALESCE(SUM(total_cents),0)::int AS n FROM supplier_orders WHERE order_id = $1 AND status IN ('confirmed','partial')`, [orderId]);
    exposure = Number(r.rows[0].n);
  }
  await db.tx((q) =>
    raiseException(q, {
      orderId,
      kind: m.kind,
      cause: `${job.type} failed after ${job.attempts} attempt(s): ${error}`,
      exposureCents: exposure,
      evidence: { jobId: job.id, error },
      actions: m.actions,
      urgent: m.urgent,
      // A failed capture must not roll back a purchased order's state.
      holdsOrder: job.type !== "order.capture",
    }),
  );
  log.warn(`dead job ${job.type}#${job.id} -> exception ${m.kind}`);
}

export const HANDLERS: Record<string, JobHandler> = {
  "order.validate": validateHandler,
  "order.quote": quoteHandler,
  "order.procure": procureHandler,
  "order.reconcile": reconcileHandler,
  "order.capture": captureHandler,
  "order.track": trackHandler,
  "order.cancel_purchased": cancelPurchasedHandler,
  "payment.void": voidHandler,
  "system.sweep": sweepHandler,
};
