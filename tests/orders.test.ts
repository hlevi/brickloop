import { beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { applyEdits, createDesign } from "@/lib/designs";
import { resolveException } from "@/lib/exceptions/resolve";
import { acceptQuote, createOrder, getCustomerOrder, requestCancel } from "@/lib/orders/service";
import { getSettings, updateSettings, updateSimulatorSettings } from "@/lib/settings";
import { SimulatorSupplier } from "@/lib/suppliers/simulator";
import { claimWish, createWish, getWishForGrownup, KID_STAGES, kidStatus } from "@/lib/wishes";
import { CONTACT, freshDb, openExceptions, orderStatus, runAll } from "./helpers";

const cust = () => crypto.randomUUID();

async function orderAwaitingAcceptance(customer = cust()) {
  const designId = await createDesign(customer, "cottage");
  const orderId = await createOrder(customer, { designId, contact: CONTACT, adultConfirmed: true });
  await runAll();
  expect(await orderStatus(orderId)).toBe("awaiting_acceptance");
  const view = await getCustomerOrder(customer, orderId);
  return { customer, designId, orderId, quote: view.quote! };
}

async function shipAndDeliver(orderId: string) {
  const db = await getDb();
  const refs = await db.query<{ supplier_order_ref: string }>(`SELECT supplier_order_ref FROM supplier_orders WHERE order_id = $1 AND status = 'confirmed'`, [orderId]);
  const sim = new SimulatorSupplier();
  for (const r of refs.rows) await sim.fastForward(r.supplier_order_ref, "delivered");
  await runAll();
}

describe("order workflow (simulation)", () => {
  beforeEach(async () => {
    await freshDb();
  });

  it("completes a routine order end to end with no owner intervention", async () => {
    const { customer, orderId, quote } = await orderAwaitingAcceptance();
    expect(quote.complete).toBe(true);
    expect(quote.mode).toBe("simulated");
    expect(quote.customer_total_cents).toBe(quote.supplier_total_cents + quote.service_fee_cents);
    expect(quote.parts_cents + quote.picking_cents + quote.packaging_cents + quote.shipping_cents + quote.tax_cents).toBe(quote.supplier_total_cents);
    await acceptQuote(customer, orderId, { quoteId: quote.id, paymentMethod: "sim_ok" });
    await runAll();
    expect(await orderStatus(orderId)).toBe("purchased");
    const db = await getDb();
    const pay = (await db.query<{ status: string; captured_cents: number; mode: string }>(`SELECT status, captured_cents, mode FROM payments WHERE order_id = $1`, [orderId])).rows[0];
    expect(pay).toMatchObject({ status: "captured", captured_cents: quote.customer_total_cents, mode: "simulated" });
    const so = (await db.query<{ mode: string; status: string }>(`SELECT mode, status FROM supplier_orders WHERE order_id = $1`, [orderId])).rows;
    expect(so).toEqual([{ mode: "simulated", status: "confirmed" }]);
    await shipAndDeliver(orderId);
    expect(await orderStatus(orderId)).toBe("delivered");
    const exc = await db.query(`SELECT * FROM exceptions WHERE order_id = $1`, [orderId]);
    expect(exc.rows).toHaveLength(0);
    const view = await getCustomerOrder(customer, orderId);
    expect(view.shipments[0].tracking_number).toMatch(/^SIMTRK/);
    expect(view.history.map((h) => h.to_status)).toEqual(["draft", "validating", "quoting", "awaiting_acceptance", "payment_authorized", "procuring", "purchased", "shipped", "delivered"]);
  });

  it("isolates customer orders", async () => {
    const { orderId } = await orderAwaitingAcceptance();
    await expect(getCustomerOrder(cust(), orderId)).rejects.toThrow(/not found/i);
    await expect(requestCancel(cust(), orderId, "x")).rejects.toThrow(/not found/i);
  });

  it("requires adult confirmation and valid contact details", async () => {
    const c = cust();
    const designId = await createDesign(c, "cottage");
    await expect(createOrder(c, { designId, contact: CONTACT, adultConfirmed: false })).rejects.toThrow(/18/);
    await expect(createOrder(c, { designId, contact: { ...CONTACT, email: "nope" }, adultConfirmed: true })).rejects.toThrow(/Email/);
  });

  it("freezes the design revision at checkout", async () => {
    const { customer, designId, orderId } = await orderAwaitingAcceptance();
    const { applyEdits } = await import("@/lib/designs");
    await applyEdits(customer, designId, [{ name: "set_option", input: { option: "size", value: "roomy" } }], "visual");
    const view = await getCustomerOrder(customer, orderId);
    expect(view.model.params.options.size).toBe("cozy");
  });

  it("refuses expired quotes and re-quotes", async () => {
    const { customer, orderId, quote } = await orderAwaitingAcceptance();
    const db = await getDb();
    await db.query(`UPDATE quotes SET expires_at = now() - interval '1 minute' WHERE id = $1`, [quote.id]);
    await expect(acceptQuote(customer, orderId, { quoteId: quote.id, paymentMethod: "sim_ok" })).rejects.toThrow(/expired/);
    expect(await orderStatus(orderId)).toBe("quoting");
    await runAll();
    const v = await getCustomerOrder(customer, orderId);
    expect(v.order.status).toBe("awaiting_acceptance");
    expect(v.quote!.id).not.toBe(quote.id);
    const pays = await db.query(`SELECT * FROM payments WHERE order_id = $1`, [orderId]);
    expect(pays.rows).toHaveLength(0);
  });

  it("handles a declined payment without creating supplier orders", async () => {
    const { customer, orderId, quote } = await orderAwaitingAcceptance();
    await expect(acceptQuote(customer, orderId, { quoteId: quote.id, paymentMethod: "sim_decline" })).rejects.toThrow(/declined/);
    expect(await orderStatus(orderId)).toBe("awaiting_acceptance");
    await acceptQuote(customer, orderId, { quoteId: quote.id, paymentMethod: "sim_ok" });
    await runAll();
    expect(await orderStatus(orderId)).toBe("purchased");
  });

  it("never charges more when cost rises after acceptance; customer must re-accept", async () => {
    const { customer, orderId, quote } = await orderAwaitingAcceptance();
    await acceptQuote(customer, orderId, { quoteId: quote.id, paymentMethod: "sim_ok" });
    await updateSimulatorSettings({ priceDriftPercent: 20 }, "test");
    await runAll();
    expect(await orderStatus(orderId)).toBe("exception");
    const [ex] = await openExceptions(orderId);
    expect(ex.kind).toBe("quote_changed");
    const db = await getDb();
    expect((await db.query(`SELECT * FROM supplier_orders WHERE order_id = $1`, [orderId])).rows).toHaveLength(0);
    await resolveException({ exceptionId: ex.id, action: "offer_revised_quote", ownerMinutes: 2 }, "admin");
    const voided = (await db.query<{ status: string }>(`SELECT status FROM payments WHERE order_id = $1`, [orderId])).rows;
    expect(voided.map((p) => p.status)).toEqual(["voided"]);
    await runAll();
    const v = await getCustomerOrder(customer, orderId);
    expect(v.order.status).toBe("awaiting_acceptance");
    expect(v.quote!.customer_total_cents).toBeGreaterThan(quote.customer_total_cents);
    await acceptQuote(customer, orderId, { quoteId: v.quote!.id, paymentMethod: "sim_ok" });
    await runAll();
    expect(await orderStatus(orderId)).toBe("purchased");
    const cap = (await db.query<{ captured_cents: number }>(`SELECT captured_cents FROM payments WHERE order_id = $1 AND status = 'captured'`, [orderId])).rows[0];
    expect(cap.captured_cents).toBe(v.quote!.customer_total_cents);
  });

  it("reports incomplete quotes when stock is missing (no substitutions)", async () => {
    await updateSimulatorSettings({ outOfStock: ["slope-45-2x4|red"] }, "test");
    const c = cust();
    const designId = await createDesign(c, "cottage");
    const orderId = await createOrder(c, { designId, contact: CONTACT, adultConfirmed: true });
    await runAll();
    expect(await orderStatus(orderId)).toBe("exception");
    expect((await openExceptions(orderId))[0].kind).toBe("quote_incomplete");
  });

  it("re-checks stock before purchase", async () => {
    const { customer, orderId, quote } = await orderAwaitingAcceptance();
    await acceptQuote(customer, orderId, { quoteId: quote.id, paymentMethod: "sim_ok" });
    await updateSimulatorSettings({ outOfStock: ["brick-1x2-nt|trans-clear"] }, "test");
    await runAll();
    expect((await openExceptions(orderId))[0].kind).toBe("quote_changed");
  });

  it("blocks invalid designs from procurement", async () => {
    const c = cust();
    const designId = await createDesign(c, "cottage");
    const db = await getDb();
    // Corrupt the stored revision so its model has a collision.
    const rev = (await db.query<{ id: string; model: { parts: unknown[] } }>(`SELECT r.id, r.model FROM design_revisions r JOIN designs d ON d.current_revision_id = r.id WHERE d.id = $1`, [designId])).rows[0];
    rev.model.parts.push({ ...(rev.model.parts[3] as object), uid: "evil" });
    await db.query(`UPDATE design_revisions SET model = $2 WHERE id = $1`, [rev.id, JSON.stringify(rev.model)]);
    const orderId = await createOrder(c, { designId, contact: CONTACT, adultConfirmed: true });
    await runAll();
    expect(await orderStatus(orderId)).toBe("exception");
    expect((await openExceptions(orderId))[0].kind).toBe("validation_failed");
    expect((await db.query(`SELECT * FROM quotes WHERE order_id = $1`, [orderId])).rows).toHaveLength(0);
  });

  it("enforces the per-order and daily spending limits", async () => {
    await updateSettings({ maxOrderSupplierCents: 500 }, "test");
    const c = cust();
    const designId = await createDesign(c, "cottage");
    const orderId = await createOrder(c, { designId, contact: CONTACT, adultConfirmed: true });
    await runAll();
    expect((await openExceptions(orderId))[0].kind).toBe("limit_exceeded");

    await updateSettings({ maxOrderSupplierCents: 15000, dailySpendLimitCents: 100 }, "test");
    const o2 = await orderAwaitingAcceptance();
    await acceptQuote(o2.customer, o2.orderId, { quoteId: o2.quote.id, paymentMethod: "sim_ok" });
    await runAll();
    const ex = await openExceptions(o2.orderId);
    expect(ex[0].kind).toBe("limit_exceeded");
    const db = await getDb();
    expect((await db.query(`SELECT * FROM supplier_orders WHERE order_id = $1`, [o2.orderId])).rows).toHaveLength(0);
  });

  it("pauses purchasing without losing the order", async () => {
    const { customer, orderId, quote } = await orderAwaitingAcceptance();
    await updateSettings({ purchasingPaused: true }, "test");
    await acceptQuote(customer, orderId, { quoteId: quote.id, paymentMethod: "sim_ok" });
    await runAll(3);
    expect(await orderStatus(orderId)).toBe("payment_authorized");
    await updateSettings({ purchasingPaused: false }, "test");
    await runAll();
    expect(await orderStatus(orderId)).toBe("purchased");
  });

  it("reconciles a timeout where the supplier DID place the order (no duplicate purchase)", async () => {
    const { customer, orderId, quote } = await orderAwaitingAcceptance();
    await updateSimulatorSettings({ nextPurchaseFault: "timeout_placed" }, "test");
    await acceptQuote(customer, orderId, { quoteId: quote.id, paymentMethod: "sim_ok" });
    await runAll();
    expect(await orderStatus(orderId)).toBe("purchased");
    const db = await getDb();
    const sim = await db.query(`SELECT * FROM sim_supplier_orders`);
    expect(sim.rows).toHaveLength(1);
    const so = (await db.query<{ status: string }>(`SELECT status FROM supplier_orders WHERE order_id = $1`, [orderId])).rows;
    expect(so.map((s) => s.status)).toEqual(["confirmed"]);
  });

  it("reconciles a timeout where the order was NOT placed, then retries safely", async () => {
    const { customer, orderId, quote } = await orderAwaitingAcceptance();
    await updateSimulatorSettings({ nextPurchaseFault: "timeout_not_placed" }, "test");
    await acceptQuote(customer, orderId, { quoteId: quote.id, paymentMethod: "sim_ok" });
    await runAll();
    expect(await orderStatus(orderId)).toBe("purchased");
    const db = await getDb();
    const so = (await db.query<{ status: string; attempt: number }>(`SELECT status, attempt FROM supplier_orders WHERE order_id = $1 ORDER BY attempt`, [orderId])).rows;
    expect(so).toEqual([
      { status: "not_placed", attempt: 1 },
      { status: "confirmed", attempt: 2 },
    ]);
    expect((await db.query(`SELECT * FROM sim_supplier_orders`)).rows).toHaveLength(1);
  });

  it("raises an urgent exception with exposure on partial procurement and can compensate", async () => {
    const { customer, orderId, quote } = await orderAwaitingAcceptance();
    await updateSimulatorSettings({ nextPurchaseFault: "partial" }, "test");
    await acceptQuote(customer, orderId, { quoteId: quote.id, paymentMethod: "sim_ok" });
    await runAll();
    expect(await orderStatus(orderId)).toBe("exception");
    const [ex] = await openExceptions(orderId);
    expect(ex.kind).toBe("partial_procurement");
    expect(ex.urgent).toBe(true);
    expect(ex.exposure_cents).toBeGreaterThan(0);
    const db = await getDb();
    expect((await db.query<{ status: string }>(`SELECT status FROM payments WHERE order_id = $1`, [orderId])).rows[0].status).toBe("authorized"); // not captured
    await resolveException({ exceptionId: ex.id, action: "cancel_supplier_and_refund", ownerMinutes: 5 }, "admin");
    expect(await orderStatus(orderId)).toBe("canceled");
    expect((await db.query<{ status: string }>(`SELECT status FROM payments WHERE order_id = $1`, [orderId])).rows[0].status).toBe("voided");
    expect((await db.query<{ status: string }>(`SELECT status FROM sim_supplier_orders`)).rows[0].status).toBe("canceled");
    const urgent = await db.query(`SELECT * FROM notifications WHERE kind = 'urgent'`);
    expect(urgent.rows.length).toBeGreaterThan(0);
  });

  it("raises capture_failed after bounded retries and keeps the purchase state", async () => {
    const { customer, orderId, quote } = await orderAwaitingAcceptance();
    await acceptQuote(customer, orderId, { quoteId: quote.id, paymentMethod: "sim_capture_fail" });
    await runAll(30);
    expect(["purchased", "shipped"]).toContain(await orderStatus(orderId));
    const ex = await openExceptions(orderId);
    expect(ex.map((e) => e.kind)).toContain("capture_failed");
    const cf = ex.find((e) => e.kind === "capture_failed")!;
    expect(cf.exposure_cents).toBeGreaterThan(0);
    const db = await getDb();
    const attempts = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM job_attempts a JOIN jobs j ON j.id = a.job_id WHERE j.type = 'order.capture'`);
    expect(Number(attempts.rows[0].n)).toBe(4);
  });

  it("cancels before purchase and releases the authorization", async () => {
    const { customer, orderId, quote } = await orderAwaitingAcceptance();
    await updateSettings({ purchasingPaused: true }, "test");
    await acceptQuote(customer, orderId, { quoteId: quote.id, paymentMethod: "sim_ok" });
    const r = await requestCancel(customer, orderId, "changed my mind");
    expect(r.outcome).toBe("canceled");
    await updateSettings({ purchasingPaused: false }, "test");
    await runAll();
    expect(await orderStatus(orderId)).toBe("canceled");
    const db = await getDb();
    expect((await db.query<{ status: string }>(`SELECT status FROM payments WHERE order_id = $1`, [orderId])).rows[0].status).toBe("voided");
    expect((await db.query(`SELECT * FROM supplier_orders WHERE order_id = $1`, [orderId])).rows).toHaveLength(0);
  });

  it("cancels after purchase (before shipping) through the supplier and refunds", async () => {
    const { customer, orderId, quote } = await orderAwaitingAcceptance();
    await acceptQuote(customer, orderId, { quoteId: quote.id, paymentMethod: "sim_ok" });
    await runAll(4);
    expect(await orderStatus(orderId)).toBe("purchased");
    const r = await requestCancel(customer, orderId, "wrong colors");
    expect(r.outcome).toBe("processing");
    await runAll();
    expect(await orderStatus(orderId)).toBe("refunded");
  });

  it("turns post-delivery cancellation into a refund request for the owner", async () => {
    const { customer, orderId, quote } = await orderAwaitingAcceptance();
    await acceptQuote(customer, orderId, { quoteId: quote.id, paymentMethod: "sim_ok" });
    await runAll();
    await shipAndDeliver(orderId);
    const r = await requestCancel(customer, orderId, "missing bricks");
    expect(r.outcome).toBe("requested");
    const [ex] = await openExceptions(orderId);
    expect(ex.kind).toBe("refund_request");
    expect(await orderStatus(orderId)).toBe("delivered"); // informational, not held
    await resolveException({ exceptionId: ex.id, action: "approve_refund", ownerMinutes: 3 }, "admin");
    expect(await orderStatus(orderId)).toBe("refunded");
  });

  it("rejects resolution actions not offered for an exception", async () => {
    await updateSimulatorSettings({ outOfStock: ["slope-45-2x4|red"] }, "test");
    const c = cust();
    const designId = await createDesign(c, "cottage");
    const orderId = await createOrder(c, { designId, contact: CONTACT, adultConfirmed: true });
    await runAll();
    const [ex] = await openExceptions(orderId);
    await expect(resolveException({ exceptionId: ex.id, action: "approve_refund" }, "admin")).rejects.toThrow(/not available/);
  });

  it("treats a double-submitted acceptance idempotently (one authorization, one purchase)", async () => {
    const { customer, orderId, quote } = await orderAwaitingAcceptance();
    const results = await Promise.allSettled([
      acceptQuote(customer, orderId, { quoteId: quote.id, paymentMethod: "sim_ok" }),
      acceptQuote(customer, orderId, { quoteId: quote.id, paymentMethod: "sim_ok" }),
    ]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    await runAll();
    const db = await getDb();
    expect((await db.query(`SELECT * FROM payments WHERE order_id = $1`, [orderId])).rows).toHaveLength(1);
    expect((await db.query(`SELECT * FROM sim_payments`)).rows).toHaveLength(1);
    expect((await db.query(`SELECT * FROM supplier_orders WHERE order_id = $1`, [orderId])).rows).toHaveLength(1);
  });

  it("flags delivery delays without blocking the order and sends a digest", async () => {
    const { customer, orderId, quote } = await orderAwaitingAcceptance();
    await acceptQuote(customer, orderId, { quoteId: quote.id, paymentMethod: "sim_ok" });
    await runAll(4);
    const db = await getDb();
    await db.query(`UPDATE orders SET estimated_delivery_at = now() - interval '10 days' WHERE id = $1`, [orderId]);
    const { enqueue } = await import("@/lib/jobs/queue");
    await enqueue(db, "system.sweep", {}, { dedupeKey: "sweep:test" });
    await runAll(3);
    const ex = await openExceptions(orderId);
    expect(ex.map((e) => e.kind)).toContain("delivery_delayed");
    expect(["purchased", "shipped"]).toContain(await orderStatus(orderId));
    expect((await db.query(`SELECT * FROM notifications WHERE kind = 'digest'`)).rows.length).toBe(1);
  });
});

describe("creature orders through a grown-up wish (fixed price)", () => {
  beforeEach(async () => {
    await freshDb();
  });

  /** The most expensive creature (61 pieces, about $12.82 simulated supplier cost). */
  const WORST_CASE = { body: "long", legs: "stompers", head: "robo", eyes: "googly", tail: "whip", back: "shell", crown: "horns" };

  /** Kid makes a wish; a grown-up looks at it and claims it into their own session. */
  async function claimedCreature(options: Record<string, string> = {}) {
    const kid = cust();
    const kidDesign = await createDesign(kid, "creature");
    const calls = Object.entries(options).map(([option, value]) => ({ name: "set_option", input: { option, value } }));
    if (calls.length) expect((await applyEdits(kid, kidDesign, calls, "visual")).rejected).toEqual([]);
    const wish = await createWish(kid, kidDesign, "together");
    await getWishForGrownup(wish.code);
    const adult = cust();
    const { designId } = await claimWish(adult, wish.code);
    return { kid, adult, designId, code: wish.code };
  }

  async function fastForward(orderId: string, to: "shipped" | "delivered") {
    const db = await getDb();
    const refs = await db.query<{ supplier_order_ref: string }>(`SELECT supplier_order_ref FROM supplier_orders WHERE order_id = $1 AND status = 'confirmed'`, [orderId]);
    for (const r of refs.rows) await new SimulatorSupplier().fastForward(r.supplier_order_ref, to);
    await runAll();
  }

  it("drives a wish-claimed creature to delivered at exactly the fixed price while the kid stage only moves forward", async () => {
    const { kid, adult, designId, code } = await claimedCreature(WORST_CASE);
    const stages: string[] = [];
    const record = async () => {
      const s = await kidStatus(kid, code);
      expect(s.slow).toBe(false);
      stages.push(s.stage);
    };
    await record();
    const orderId = await createOrder(adult, { designId, contact: CONTACT, adultConfirmed: true });
    await record();
    await runAll();
    expect(await orderStatus(orderId)).toBe("awaiting_acceptance");
    await record();
    const s = await getSettings();
    const { quote, order } = await getCustomerOrder(adult, orderId);
    expect(order.fixed_price_cents).toBe(s.creaturePriceCents);
    expect(quote!.complete).toBe(true);
    expect(quote!.customer_total_cents).toBe(s.creaturePriceCents);
    expect(quote!.service_fee_cents).toBe(s.creaturePriceCents - quote!.supplier_total_cents);
    expect(quote!.contribution_cents).toBe(quote!.service_fee_cents - quote!.payment_fee_estimate_cents);
    expect(quote!.contribution_cents).toBeGreaterThanOrEqual(s.minContributionCents);
    await acceptQuote(adult, orderId, { quoteId: quote!.id, paymentMethod: "sim_ok" });
    await record();
    await runAll();
    expect(await orderStatus(orderId)).toBe("purchased");
    await record();
    await fastForward(orderId, "shipped");
    expect(await orderStatus(orderId)).toBe("shipped");
    await record();
    await fastForward(orderId, "delivered");
    expect(await orderStatus(orderId)).toBe("delivered");
    await record();
    expect(stages).toEqual(["seen", "ordered", "ordered", "gathering", "packing", "on_the_way", "arrived"]);
    const idx = stages.map((st) => KID_STAGES.indexOf(st as (typeof KID_STAGES)[number]));
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThanOrEqual(idx[i - 1]);
    const db = await getDb();
    const pay = (await db.query<{ status: string; amount_cents: number; captured_cents: number }>(`SELECT * FROM payments WHERE order_id = $1`, [orderId])).rows;
    expect(pay).toEqual([expect.objectContaining({ status: "captured", amount_cents: s.creaturePriceCents, captured_cents: s.creaturePriceCents })]);
    expect((await db.query(`SELECT * FROM exceptions WHERE order_id = $1`, [orderId])).rows).toHaveLength(0);
    // Order emails go only to the adult purchaser and keep the simulation prefix.
    const mail = (await db.query<{ recipient: string; subject: string }>(`SELECT recipient, subject FROM notifications WHERE kind = 'customer'`)).rows;
    expect(mail.length).toBeGreaterThan(0);
    for (const m of mail) {
      expect(m.recipient).toBe(CONTACT.email);
      expect(m.subject.startsWith("[SIMULATION] ")).toBe(true);
    }
  });

  it("never authorizes or captures more than the fixed price", async () => {
    const { adult, designId } = await claimedCreature();
    const orderId = await createOrder(adult, { designId, contact: CONTACT, adultConfirmed: true });
    await runAll();
    const { quote } = await getCustomerOrder(adult, orderId);
    const db = await getDb();
    // A quote that somehow differs from the fixed price is refused before any authorization.
    await db.query(`UPDATE quotes SET customer_total_cents = 2500 WHERE id = $1`, [quote!.id]);
    await expect(acceptQuote(adult, orderId, { quoteId: quote!.id, paymentMethod: "sim_ok" })).rejects.toThrow(/fixed price/);
    expect((await db.query(`SELECT * FROM payments WHERE order_id = $1`, [orderId])).rows).toHaveLength(0);
    await db.query(`UPDATE quotes SET customer_total_cents = 2400 WHERE id = $1`, [quote!.id]);
    await acceptQuote(adult, orderId, { quoteId: quote!.id, paymentMethod: "sim_ok" });
    // Even if the stored amounts were inflated afterwards, the capture is capped at the fixed price.
    await db.query(`UPDATE orders SET accepted_total_cents = 9999 WHERE id = $1`, [orderId]);
    await db.query(`UPDATE payments SET amount_cents = 9999 WHERE order_id = $1`, [orderId]);
    await runAll();
    expect(await orderStatus(orderId)).toBe("purchased");
    const pay = (await db.query<{ status: string; captured_cents: number }>(`SELECT * FROM payments WHERE order_id = $1`, [orderId])).rows;
    expect(pay).toEqual([expect.objectContaining({ status: "captured", captured_cents: 2400 })]);
  });

  it("an exception holds the kid stage it came from with 'slow', and a refund sends the kid back to waiting", async () => {
    const { kid, adult, designId, code } = await claimedCreature();
    const orderId = await createOrder(adult, { designId, contact: CONTACT, adultConfirmed: true });
    await runAll();
    const { quote } = await getCustomerOrder(adult, orderId);
    await acceptQuote(adult, orderId, { quoteId: quote!.id, paymentMethod: "sim_ok" });
    await runAll();
    await fastForward(orderId, "shipped");
    expect(await kidStatus(kid, code)).toEqual({ stage: "on_the_way", slow: false });
    const db = await getDb();
    // Simulate a held order (e.g. a delivery problem the owner is looking at).
    await db.query(`UPDATE orders SET status = 'exception', held_from_status = 'shipped' WHERE id = $1`, [orderId]);
    expect(await kidStatus(kid, code)).toEqual({ stage: "on_the_way", slow: true });
    await db.query(`UPDATE orders SET status = 'refunded', held_from_status = NULL WHERE id = $1`, [orderId]);
    expect(await kidStatus(kid, code)).toEqual({ stage: "waiting", slow: false });
  });

  it("keeps ready-made kits on estimate-then-quote pricing", async () => {
    const c = cust();
    const designId = await createDesign(c, "cottage");
    const orderId = await createOrder(c, { designId, contact: CONTACT, adultConfirmed: true });
    await runAll();
    const { quote, order } = await getCustomerOrder(c, orderId);
    expect(order.fixed_price_cents).toBeNull();
    expect(order.wish_code).toBeNull();
    expect(quote!.customer_total_cents).toBe(quote!.supplier_total_cents + quote!.service_fee_cents);
    expect(quote!.customer_total_cents).not.toBe((await getSettings()).creaturePriceCents);
  });

  it("raises contribution_below_minimum on a 150% supplier drift and never charges above the fixed price", async () => {
    await updateSimulatorSettings({ priceDriftPercent: 150 }, "test");
    const { kid, adult, designId, code } = await claimedCreature(WORST_CASE);
    const orderId = await createOrder(adult, { designId, contact: CONTACT, adultConfirmed: true });
    await runAll();
    expect(await orderStatus(orderId)).toBe("exception");
    const [ex] = await openExceptions(orderId);
    expect(ex.kind).toBe("contribution_below_minimum");
    const db = await getDb();
    const quotes = (await db.query<{ customer_total_cents: number; supplier_total_cents: number; contribution_cents: number }>(`SELECT * FROM quotes WHERE order_id = $1`, [orderId])).rows;
    expect(quotes.length).toBeGreaterThan(0);
    for (const q of quotes) {
      expect(q.customer_total_cents).toBe(2400);
      expect(q.supplier_total_cents).toBeGreaterThan(2400 * 0.8);
      expect(q.contribution_cents).toBeLessThan(150);
    }
    // A held order cannot be accepted, so nothing is authorized or charged.
    const v = await getCustomerOrder(adult, orderId);
    if (v.quote) await expect(acceptQuote(adult, orderId, { quoteId: v.quote.id, paymentMethod: "sim_ok" })).rejects.toThrow(/nothing to accept/);
    expect((await db.query(`SELECT * FROM payments WHERE order_id = $1`, [orderId])).rows).toHaveLength(0);
    expect((await db.query(`SELECT * FROM sim_payments`)).rows).toHaveLength(0);
    // The kid only sees "Ordered!" with "Taking a little longer".
    expect(await kidStatus(kid, code)).toEqual({ stage: "ordered", slow: true });
    // The owner cancels: the kid goes back to "Waiting for a grown-up", and the grown-up may order again later.
    await resolveException({ exceptionId: ex.id, action: "cancel_and_release", ownerMinutes: 1 }, "admin");
    expect(await orderStatus(orderId)).toBe("canceled");
    expect(await kidStatus(kid, code)).toEqual({ stage: "waiting", slow: false });
    await updateSimulatorSettings({ priceDriftPercent: 0 }, "test");
    expect(await claimWish(adult, code)).toEqual({ designId, orderId: null });
    const again = await createOrder(adult, { designId, contact: CONTACT, adultConfirmed: true });
    await runAll();
    expect(await orderStatus(again)).toBe("awaiting_acceptance");
    expect((await getCustomerOrder(adult, again)).quote!.customer_total_cents).toBe(2400);
    expect(await kidStatus(kid, code)).toEqual({ stage: "ordered", slow: false });
  });
});
