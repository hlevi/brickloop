import { getDb, type Queryable } from "../db";
import { audit } from "../audit";
import { computeBom, type Bom } from "../bom/bom";
import { loadMappingLookup } from "../catalog/mappingStore";
import { env } from "../config";
import { ensureCustomer } from "../designs";
import { raiseException, resolveAllForOrder } from "../exceptions/service";
import { enqueue } from "../jobs/queue";
import type { DesignModel } from "../model/types";
import { getPaymentProvider } from "../payments/simulated";
import { PaymentDeclinedError } from "../payments/types";
import { getSettings } from "../settings";
import { getSupplier } from "../suppliers/registry";
import type { ShipTo } from "../suppliers/types";
import { AppError, isUuid, uuid } from "../util";
import type { ValidationResult } from "../validation/validate";
import { liveReadiness } from "./live";
import { lockOrder, transition, type OrderStatus } from "./stateMachine";

export interface Contact {
  name: string;
  email: string;
  shipTo: ShipTo;
}

export interface OrderRow {
  id: string;
  customer_id: string;
  design_id: string;
  design_revision_id: string;
  status: OrderStatus;
  mode: "simulated" | "live";
  supplier: string;
  frozen_model: DesignModel;
  frozen_bom: Bom;
  frozen_validation: ValidationResult;
  contact: Contact;
  adult_confirmed: boolean;
  budget_cents: number | null;
  accepted_quote_id: string | null;
  accepted_total_cents: number | null;
  held_from_status: OrderStatus | null;
  environmental_label: string;
  estimated_delivery_at: string | null;
  delivered_at: string | null;
  procurement_attempts: number;
  created_at: string;
  updated_at: string;
}

export interface QuoteRow {
  id: string;
  order_id: string;
  supplier: string;
  mode: string;
  status: "active" | "accepted" | "expired" | "superseded" | "rejected";
  purpose: "initial" | "recheck" | "revised";
  complete: boolean;
  issues: string[];
  lines: unknown[];
  condition: string;
  parts_cents: number;
  picking_cents: number;
  packaging_cents: number;
  shipping_cents: number;
  tax_cents: number;
  supplier_total_cents: number;
  service_fee_cents: number;
  customer_total_cents: number;
  payment_fee_estimate_cents: number;
  contribution_cents: number;
  currency: string;
  delivery_days_min: number;
  delivery_days_max: number;
  supplier_quote_ref: string | null;
  expires_at: string;
  created_at: string;
}

const MAX_FIELD = 200;
function cleanStr(v: unknown, field: string, required = true): string {
  if (typeof v !== "string" || (required && !v.trim())) throw new AppError("invalid_contact", `${field} is required`);
  return v.trim().slice(0, MAX_FIELD);
}

/** Purchaser details only: we collect an adult purchaser's contact and shipping address, nothing about children. */
export function parseContact(input: unknown): Contact {
  const o = (input ?? {}) as Record<string, unknown>;
  const s = (o.shipTo ?? {}) as Record<string, unknown>;
  const email = cleanStr(o.email, "Email");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AppError("invalid_contact", "Email is invalid");
  return {
    name: cleanStr(o.name, "Name"),
    email,
    shipTo: {
      name: cleanStr(s.name ?? o.name, "Recipient name"),
      line1: cleanStr(s.line1, "Address line 1"),
      line2: typeof s.line2 === "string" ? s.line2.trim().slice(0, MAX_FIELD) : undefined,
      city: cleanStr(s.city, "City"),
      region: cleanStr(s.region, "State/region"),
      postalCode: cleanStr(s.postalCode, "Postal code"),
      country: cleanStr(s.country, "Country").toUpperCase().slice(0, 2),
    },
  };
}

export function environmentalLabel(condition: "N" | "U" | "mixed"): "new" | "reused" | "mixed" {
  return condition === "N" ? "new" : condition === "U" ? "reused" : "mixed";
}

export async function notifyCustomer(q: Queryable, orderId: string, subject: string, body: string) {
  const { rows } = await q.query<{ contact: Contact; mode: string }>(`SELECT contact, mode FROM orders WHERE id = $1`, [orderId]);
  const c = rows[0];
  if (!c) return;
  const prefix = c.mode === "simulated" ? "[SIMULATION] " : "";
  await q.query(`INSERT INTO notifications(kind, channel, recipient, subject, body) VALUES ('customer','log',$1,$2,$3)`, [c.contact.email, prefix + subject, body]);
}

/** Start checkout: freeze the current design revision and its parts list, then hand off to the workflow. */
export async function createOrder(customerId: string, input: { designId: string; contact: unknown; adultConfirmed: unknown; budgetCents?: unknown }): Promise<string> {
  if (!isUuid(input.designId)) throw new AppError("not_found", "Design not found", 404);
  if (input.adultConfirmed !== true) throw new AppError("adult_required", "The purchaser must confirm they are 18 or older");
  const contact = parseContact(input.contact);
  const budget = input.budgetCents === undefined || input.budgetCents === null || input.budgetCents === "" ? null : Number(input.budgetCents);
  if (budget !== null && (!Number.isInteger(budget) || budget <= 0)) throw new AppError("invalid_budget", "Budget must be a positive amount in cents");
  const settings = await getSettings();
  const readiness = await liveReadiness();
  const mode: "simulated" | "live" = readiness.ready ? "live" : "simulated";
  const supplier = mode === "live" ? env.supplier : "simulator";
  getSupplier(supplier); // enforce allowlist up front
  const db = await getDb();
  const lookup = await loadMappingLookup();
  return db.tx(async (q) => {
    await ensureCustomer(q, customerId);
    const d = await q.query<{ current_revision_id: string }>(`SELECT current_revision_id FROM designs WHERE id = $1 AND customer_id = $2`, [input.designId, customerId]);
    if (!d.rows[0]) throw new AppError("not_found", "Design not found", 404);
    const revId = d.rows[0].current_revision_id;
    const rev = await q.query<{ model: DesignModel; validation: ValidationResult }>(`SELECT model, validation FROM design_revisions WHERE id = $1`, [revId]);
    const model = rev.rows[0].model;
    const bom = computeBom(model, lookup);
    const id = uuid();
    await q.query(
      `INSERT INTO orders(id, customer_id, design_id, design_revision_id, status, mode, supplier, frozen_model, frozen_bom, frozen_validation, contact, adult_confirmed, budget_cents, environmental_label)
       VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,true,$11,$12)`,
      [id, customerId, input.designId, revId, mode, supplier, JSON.stringify(model), JSON.stringify(bom), JSON.stringify(rev.rows[0].validation), JSON.stringify(contact), budget, environmentalLabel(settings.condition)],
    );
    await q.query(`INSERT INTO order_status_history(order_id, from_status, to_status, reason, actor) VALUES ($1,NULL,'draft','checkout started',$2)`, [id, `customer:${customerId}`]);
    await audit(q, `customer:${customerId}`, "order.create", "order", id, { designRevisionId: revId, mode });
    await transition(q, id, "validating", "design frozen for validation", "system");
    await enqueue(q, "order.validate", { orderId: id }, { dedupeKey: `validate:${id}:1` });
    return id;
  });
}

async function loadOrderOwned(q: Queryable, customerId: string, orderId: string): Promise<OrderRow> {
  if (!isUuid(orderId)) throw new AppError("not_found", "Order not found", 404);
  const { rows } = await q.query<OrderRow>(`SELECT * FROM orders WHERE id = $1 AND customer_id = $2`, [orderId, customerId]);
  if (!rows[0]) throw new AppError("not_found", "Order not found", 404);
  return rows[0];
}

export async function getOrderRow(orderId: string, q?: Queryable): Promise<OrderRow> {
  const db = q ?? (await getDb());
  const { rows } = await db.query<OrderRow>(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  if (!rows[0]) throw new AppError("not_found", "Order not found", 404);
  return rows[0];
}

export async function activeQuote(q: Queryable, orderId: string): Promise<QuoteRow | null> {
  const { rows } = await q.query<QuoteRow>(`SELECT * FROM quotes WHERE order_id = $1 AND status = 'active' AND purpose <> 'recheck' ORDER BY created_at DESC LIMIT 1`, [orderId]);
  return rows[0] ?? null;
}

export interface CustomerOrderView {
  order: Omit<OrderRow, "frozen_model"> & { frozen_model?: undefined };
  model: DesignModel;
  quote: QuoteRow | null;
  acceptedQuote: QuoteRow | null;
  payment: { status: string; amount_cents: number; captured_cents: number; refunded_cents: number; mode: string } | null;
  shipments: { status: string; supplier_order_ref: string | null; shipping_status: string | null; carrier: string | null; tracking_number: string | null; tracking_events: unknown }[];
  history: { from_status: string | null; to_status: string; reason: string | null; at: string }[];
  openIssues: { kind: string; cause: string }[];
}

export async function getCustomerOrder(customerId: string, orderId: string): Promise<CustomerOrderView> {
  const db = await getDb();
  const o = await loadOrderOwned(db, customerId, orderId);
  const quote = await activeQuote(db, orderId);
  const accepted = o.accepted_quote_id ? (await db.query<QuoteRow>(`SELECT * FROM quotes WHERE id = $1`, [o.accepted_quote_id])).rows[0] ?? null : null;
  const pay = await db.query<CustomerOrderView["payment"] & object>(
    `SELECT status, amount_cents, captured_cents, refunded_cents, mode FROM payments WHERE order_id = $1 AND status <> 'pending' ORDER BY created_at DESC LIMIT 1`,
    [orderId],
  );
  const ships = await db.query<CustomerOrderView["shipments"][number]>(
    `SELECT status, supplier_order_ref, shipping_status, carrier, tracking_number, tracking_events FROM supplier_orders WHERE order_id = $1 AND status IN ('confirmed','partial','canceled') ORDER BY created_at`,
    [orderId],
  );
  const hist = await db.query<CustomerOrderView["history"][number]>(`SELECT from_status, to_status, reason, at FROM order_status_history WHERE order_id = $1 ORDER BY id`, [orderId]);
  const issues = await db.query<{ kind: string; cause: string }>(`SELECT kind, cause FROM exceptions WHERE order_id = $1 AND status = 'open'`, [orderId]);
  const { frozen_model, ...rest } = o;
  return {
    order: rest,
    model: frozen_model,
    quote,
    acceptedQuote: accepted,
    payment: pay.rows[0] ?? null,
    shipments: ships.rows,
    history: hist.rows,
    openIssues: issues.rows.map((i) => ({ kind: i.kind, cause: customerFacingCause(i.kind) })),
  };
}

function customerFacingCause(kind: string): string {
  switch (kind) {
    case "quote_changed":
      return "The supplier's price or stock changed. We will ask you before charging anything different.";
    case "validation_failed":
      return "This design did not pass our build checks. We will contact you.";
    case "cancellation_request":
      return "Your cancellation request is being processed.";
    case "refund_request":
      return "Your refund request is being reviewed.";
    case "delivery_delayed":
      return "Delivery is running later than estimated. We are checking with the carrier.";
    default:
      return "We are resolving an issue with this order. No additional charge will be made without your approval.";
  }
}

export async function listCustomerOrders(customerId: string) {
  const db = await getDb();
  const { rows } = await db.query<{ id: string; status: string; mode: string; created_at: string; accepted_total_cents: number | null; name: string }>(
    `SELECT o.id, o.status, o.mode, o.created_at, o.accepted_total_cents, d.name FROM orders o JOIN designs d ON d.id = o.design_id
     WHERE o.customer_id = $1 ORDER BY o.created_at DESC`,
    [customerId],
  );
  return rows;
}

/**
 * Customer accepts the current quote and authorizes payment. The quote must be
 * active and unexpired; authorization is idempotent per quote + method.
 */
export async function acceptQuote(customerId: string, orderId: string, input: { quoteId: unknown; paymentMethod: unknown }) {
  const db = await getDb();
  const provider = getPaymentProvider();
  const method = typeof input.paymentMethod === "string" && /^[a-z_]{3,40}$/.test(input.paymentMethod) ? input.paymentMethod : "sim_ok";
  if (!isUuid(input.quoteId)) throw new AppError("invalid_quote", "Quote not found", 404);
  const quoteId = input.quoteId;
  const key = `auth:${quoteId}:${method}`;

  const prep = await db.tx(async (q) => {
    const o = await loadOrderOwned(q, customerId, orderId);
    await lockOrder(q, orderId);
    if (o.status !== "awaiting_acceptance") throw new AppError("invalid_state", `Order is ${o.status}; nothing to accept`, 409);
    const quote = await activeQuote(q, orderId);
    if (!quote || quote.id !== quoteId) throw new AppError("stale_quote", "This quote is no longer current. Refresh to see the latest quote.", 409);
    if (new Date(quote.expires_at).getTime() <= Date.now()) {
      await q.query(`UPDATE quotes SET status = 'expired' WHERE id = $1`, [quote.id]);
      await transition(q, orderId, "quoting", "quote expired before acceptance", "system");
      await enqueue(q, "order.quote", { orderId, purpose: "initial" }, { dedupeKey: `quote:${orderId}:${quote.id}:expired` });
      return { expired: true as const };
    }
    const existing = await q.query<{ id: string; status: string }>(`SELECT id, status FROM payments WHERE idempotency_key = $1`, [key]);
    let paymentId = existing.rows[0]?.id;
    if (!paymentId) {
      paymentId = uuid();
      await q.query(
        `INSERT INTO payments(id, order_id, provider, mode, status, amount_cents, idempotency_key, quote_id) VALUES ($1,$2,$3,$4,'pending',$5,$6,$7)`,
        [paymentId, orderId, provider.id, provider.mode, quote.customer_total_cents, key, quote.id],
      );
    }
    return { expired: false as const, quote, paymentId };
  });
  if (prep.expired) throw new AppError("quote_expired", "The quote expired. A fresh quote is being prepared.", 409);

  let auth;
  try {
    auth = await provider.authorize({ amountCents: prep.quote.customer_total_cents, currency: prep.quote.currency, idempotencyKey: key, method });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.query(`UPDATE payments SET status = 'failed', last_error = $2, updated_at = now() WHERE id = $1`, [prep.paymentId, msg]);
    await db.tx((q) => audit(q, "system", "payment.authorize_failed", "order", orderId, { error: msg }));
    if (e instanceof PaymentDeclinedError) throw new AppError("payment_declined", "Payment was declined. No charge was made. You can try another method.", 402);
    throw new AppError("payment_error", "Payment could not be authorized. No charge was made.", 502);
  }

  const raced = await db.tx(async (q) => {
    const o = await lockOrder(q, orderId);
    await q.query(`UPDATE payments SET status = 'authorized', provider_ref = $2, auth_expires_at = $3, updated_at = now() WHERE id = $1`, [prep.paymentId, auth.ref, auth.expiresAt]);
    if (o.status !== "awaiting_acceptance") {
      // Order moved on concurrently (e.g. canceled): release the authorization.
      await enqueue(q, "payment.void", { orderId, paymentId: prep.paymentId }, { dedupeKey: `void:${prep.paymentId}` });
      return o.status;
    }
    await q.query(`UPDATE quotes SET status = 'accepted' WHERE id = $1`, [prep.quote.id]);
    await q.query(`UPDATE orders SET accepted_quote_id = $2, accepted_total_cents = $3, estimated_delivery_at = now() + ($4 || ' days')::interval WHERE id = $1`, [
      orderId,
      prep.quote.id,
      prep.quote.customer_total_cents,
      String(prep.quote.delivery_days_max),
    ]);
    await transition(q, orderId, "payment_authorized", "customer accepted quote; payment authorized", `customer:${customerId}`);
    await enqueue(q, "order.procure", { orderId }, { dedupeKey: `procure:${orderId}:${prep.quote.id}`, maxAttempts: 3 });
    await notifyCustomer(q, orderId, "Payment authorized", `We authorized ${(prep.quote.customer_total_cents / 100).toFixed(2)} ${prep.quote.currency}. You are charged only after the parts are purchased.`);
    return null;
  });
  if (raced) throw new AppError("invalid_state", `Order is ${raced}; the authorization will be released`, 409);
}

/** Customer cancellation. Before purchase it is immediate; afterwards it becomes a tracked request. */
export async function requestCancel(customerId: string, orderId: string, reason: string) {
  const db = await getDb();
  const actor = `customer:${customerId}`;
  const result = await db.tx(async (q) => {
    const o = await loadOrderOwned(q, customerId, orderId);
    const locked = await lockOrder(q, orderId);
    const status = locked.status;
    if (["draft", "validating", "quoting", "awaiting_acceptance"].includes(status)) {
      await transition(q, orderId, "canceled", `customer canceled: ${reason}`, actor);
      await q.query(`UPDATE quotes SET status = 'rejected' WHERE order_id = $1 AND status = 'active'`, [orderId]);
      await resolveAllForOrder(q, orderId, "order canceled by customer", actor);
      return { outcome: "canceled" as const };
    }
    if (status === "payment_authorized" || (status === "exception" && o.held_from_status && ["validating", "quoting", "awaiting_acceptance", "payment_authorized"].includes(o.held_from_status))) {
      await transition(q, orderId, "canceled", `customer canceled: ${reason}`, actor);
      const pays = await q.query<{ id: string }>(`SELECT id FROM payments WHERE order_id = $1 AND status = 'authorized'`, [orderId]);
      for (const p of pays.rows) await enqueue(q, "payment.void", { orderId, paymentId: p.id }, { dedupeKey: `void:${p.id}` });
      await resolveAllForOrder(q, orderId, "order canceled by customer", actor);
      await notifyCustomer(q, orderId, "Order canceled", "Your order was canceled and the payment authorization released. You were not charged.");
      return { outcome: "canceled" as const };
    }
    if (status === "purchased") {
      await enqueue(q, "order.cancel_purchased", { orderId, reason }, { dedupeKey: `cancel:${orderId}` });
      return { outcome: "processing" as const };
    }
    if (["canceled", "refunded"].includes(status)) return { outcome: "already_closed" as const };
    const kind = ["shipped", "delivered"].includes(status) ? "refund_request" : "cancellation_request";
    await raiseException(q, {
      orderId,
      kind,
      cause: `Customer asked to ${kind === "refund_request" ? "return/refund" : "cancel"} while order is ${status}: ${reason || "no reason given"}`,
      actions: kind === "refund_request" ? ["approve_refund", "mark_resolved"] : ["cancel_supplier_and_refund", "mark_resolved"],
      urgent: status === "procuring",
      holdsOrder: false,
      actor,
    });
    return { outcome: "requested" as const };
  });
  return result;
}

export async function reportMissingPiece(customerId: string, orderId: string, details: string) {
  const db = await getDb();
  await db.tx(async (q) => {
    const o = await loadOrderOwned(q, customerId, orderId);
    if (!["shipped", "delivered"].includes(o.status)) throw new AppError("invalid_state", "Missing pieces can be reported after shipment", 409);
    await q.query(`INSERT INTO complaints(id, order_id, customer_id, kind, details) VALUES ($1,$2,$3,'missing_piece',$4)`, [uuid(), orderId, customerId, details.slice(0, 1000)]);
    await audit(q, `customer:${customerId}`, "order.complaint", "order", orderId, { kind: "missing_piece" });
  });
}

/** Instructions are available to the customer once the order exists; the PDF uses the frozen model. */
export async function getOrderModelForInstructions(customerId: string, orderId: string) {
  const db = await getDb();
  const o = await loadOrderOwned(db, customerId, orderId);
  return o;
}
