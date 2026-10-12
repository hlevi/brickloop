import crypto from "node:crypto";
import { getDb } from "../db";
import { getSimulatorSettings, updateSimulatorSettings } from "../settings";
import { env } from "../config";
import { SIM_PACKAGING_CENTS, SIM_PICKING_CENTS, SIM_TAX_RATE, simulatedShippingCents, simulatedUnitCents } from "./pricing-table";
import {
  SupplierAmbiguousError,
  SupplierRejectedError,
  type LookupResult,
  type PurchaseRequest,
  type PurchaseResult,
  type QuoteRequest,
  type SupplierAdapter,
  type SupplierInfo,
  type SupplierQuote,
  type TrackingInfo,
} from "./types";

export const SIMULATOR_INFO: SupplierInfo = {
  id: "simulator",
  name: "BrickLoop Supplier Simulator",
  mode: "simulated",
  capabilityStatus: "simulated",
  capabilities: { quote: true, purchase: true, lookupOrder: true, cancel: true, tracking: true },
  documentation: [],
  blockers: ["Simulated supplier: no real parts are purchased or shipped."],
  shipsDirectToCustomer: true,
  canIncludeInstructions: false,
};

const SIM_STOCK = 500;

function priceQuote(req: QuoteRequest, drift: number, outOfStock: Set<string>): Omit<SupplierQuote, "ref" | "expiresAt"> {
  const issues: string[] = [];
  const lines = req.lines.map((l) => {
    const available = outOfStock.has(`${l.partId}|${l.colorId}`) ? 0 : SIM_STOCK;
    const unitCents = Math.round(simulatedUnitCents(l.partId, l.colorId) * (1 + drift / 100));
    const matched = available >= l.quantity && !!l.externalItemId && l.externalColorId !== null;
    if (!matched) issues.push(`${l.partId} / ${l.colorId}: requested ${l.quantity}, available ${available}`);
    return { partId: l.partId, colorId: l.colorId, quantity: l.quantity, available, unitCents, condition: req.condition, matched };
  });
  const pieces = req.lines.reduce((s, l) => s + l.quantity, 0);
  const partsCents = lines.reduce((s, l) => s + l.unitCents * l.quantity, 0);
  const shippingCents = simulatedShippingCents(pieces);
  const taxCents = Math.round((partsCents + SIM_PICKING_CENTS + SIM_PACKAGING_CENTS + shippingCents) * SIM_TAX_RATE);
  const totalCents = partsCents + SIM_PICKING_CENTS + SIM_PACKAGING_CENTS + shippingCents + taxCents;
  return {
    lines,
    partsCents,
    pickingCents: SIM_PICKING_CENTS,
    packagingCents: SIM_PACKAGING_CENTS,
    shippingCents,
    taxCents,
    totalCents,
    currency: "USD",
    deliveryDaysMin: 5,
    deliveryDaysMax: 9,
    complete: issues.length === 0,
    issues,
  };
}

export class SimulatorSupplier implements SupplierAdapter {
  info = SIMULATOR_INFO;

  async quote(req: QuoteRequest): Promise<SupplierQuote> {
    const sim = await getSimulatorSettings();
    const q = priceQuote(req, sim.priceDriftPercent, new Set(sim.outOfStock));
    return {
      ...q,
      ref: `SIMQ-${crypto.randomUUID().slice(0, 8)}`,
      expiresAt: new Date(Date.now() + req.ttlMinutes * 60_000).toISOString(),
    };
  }

  async purchase(req: PurchaseRequest): Promise<PurchaseResult> {
    const db = await getDb();
    // Idempotent on clientReference: a repeated request returns the existing order.
    const existing = await this.lookupOrder(req.clientReference);
    if (existing.found) {
      return {
        status: existing.status === "partial" ? "partial" : "confirmed",
        supplierOrderRef: existing.supplierOrderRef,
        totalCents: existing.totalCents,
        purchasedLines: existing.purchasedLines,
        failedLines: existing.failedLines,
      };
    }
    // Consume a one-shot fault atomically.
    const fault = await db.tx(async (q) => {
      const sim = await getSimulatorSettings(q);
      if (sim.nextPurchaseFault) await updateSimulatorSettings({ nextPurchaseFault: null }, "simulator", q);
      return { fault: sim.nextPurchaseFault, sim };
    });
    if (fault.fault === "timeout_not_placed") throw new SupplierAmbiguousError("Simulated timeout (order was not placed)");
    if (fault.fault === "error") throw new SupplierRejectedError("Simulated supplier rejection");

    const priced = priceQuote({ lines: req.lines, condition: req.condition, shipTo: req.shipTo, ttlMinutes: 1 }, fault.sim.priceDriftPercent, new Set(fault.sim.outOfStock));
    if (priced.totalCents > req.maxTotalCents) throw new SupplierRejectedError(`Total ${priced.totalCents} exceeds max ${req.maxTotalCents}`);
    let purchasedLines = req.lines.filter((l, i) => priced.lines[i].matched);
    let failedLines = req.lines.filter((l, i) => !priced.lines[i].matched);
    if (fault.fault === "partial" && purchasedLines.length > 1) {
      failedLines = [...failedLines, purchasedLines[purchasedLines.length - 1]];
      purchasedLines = purchasedLines.slice(0, -1);
    }
    if (purchasedLines.length === 0) throw new SupplierRejectedError("No requested lines are available");
    const status: PurchaseResult["status"] = failedLines.length ? "partial" : "confirmed";
    const totalCents = failedLines.length
      ? priceQuote({ lines: purchasedLines, condition: req.condition, shipTo: req.shipTo, ttlMinutes: 1 }, fault.sim.priceDriftPercent, new Set()).totalCents
      : priced.totalCents;
    const ref = `SIMO-${crypto.createHash("sha256").update(req.clientReference).digest("hex").slice(0, 10).toUpperCase()}`;
    const now = Date.now();
    await db.query(
      `INSERT INTO sim_supplier_orders(ref, client_reference, lines, total_cents, status, ship_after, deliver_after)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (client_reference) DO NOTHING`,
      [
        ref,
        req.clientReference,
        JSON.stringify({ purchased: purchasedLines, failed: failedLines }),
        totalCents,
        status,
        new Date(now + env.simShipAfterSeconds * 1000).toISOString(),
        new Date(now + env.simDeliverAfterSeconds * 1000).toISOString(),
      ],
    );
    if (fault.fault === "timeout_placed") throw new SupplierAmbiguousError("Simulated timeout (order WAS placed)");
    return { status, supplierOrderRef: ref, totalCents, purchasedLines, failedLines };
  }

  async lookupOrder(clientReference: string): Promise<LookupResult> {
    const db = await getDb();
    const { rows } = await db.query<{ ref: string; status: string; total_cents: number; lines: { purchased: never[]; failed: never[] } }>(
      `SELECT ref, status, total_cents, lines FROM sim_supplier_orders WHERE client_reference = $1`,
      [clientReference],
    );
    const r = rows[0];
    if (!r) return { found: false };
    return {
      found: true,
      supplierOrderRef: r.ref,
      status: r.status as "confirmed" | "partial" | "canceled",
      totalCents: r.total_cents,
      purchasedLines: r.lines.purchased,
      failedLines: r.lines.failed,
    };
  }

  async cancel(ref: string): Promise<{ canceled: boolean; reason?: string }> {
    const db = await getDb();
    const { rows } = await db.query<{ ship_after: Date | string; status: string }>(`SELECT ship_after, status FROM sim_supplier_orders WHERE ref = $1`, [ref]);
    const r = rows[0];
    if (!r) return { canceled: false, reason: "Unknown order" };
    if (r.status === "canceled") return { canceled: true };
    if (new Date(r.ship_after).getTime() <= Date.now()) return { canceled: false, reason: "Already shipped" };
    await db.query(`UPDATE sim_supplier_orders SET status = 'canceled' WHERE ref = $1`, [ref]);
    return { canceled: true };
  }

  async getTracking(ref: string): Promise<TrackingInfo> {
    const db = await getDb();
    const { rows } = await db.query<{ created_at: Date | string; ship_after: Date | string; deliver_after: Date | string; status: string }>(
      `SELECT created_at, ship_after, deliver_after, status FROM sim_supplier_orders WHERE ref = $1`,
      [ref],
    );
    const r = rows[0];
    if (!r) throw new Error(`Unknown simulated order ${ref}`);
    const created = new Date(r.created_at).toISOString();
    if (r.status === "canceled") return { status: "canceled", carrier: null, trackingNumber: null, events: [{ at: created, description: "Order canceled (simulated)" }] };
    const now = Date.now();
    const ship = new Date(r.ship_after);
    const deliver = new Date(r.deliver_after);
    const events = [{ at: created, description: "Order received by supplier (simulated)" }];
    const trackingNumber = `SIMTRK${ref.slice(5)}`;
    if (now < ship.getTime()) return { status: "processing", carrier: null, trackingNumber: null, events };
    events.push({ at: ship.toISOString(), description: "Picked, packed and handed to carrier (simulated)" });
    if (now < deliver.getTime()) return { status: "shipped", carrier: "SimPost", trackingNumber, events };
    events.push({ at: deliver.toISOString(), description: "Delivered (simulated)" });
    return { status: "delivered", carrier: "SimPost", trackingNumber, events };
  }

  /** Test/demo helper: make the simulated clock reach shipping or delivery now. */
  async fastForward(ref: string, to: "shipped" | "delivered") {
    const db = await getDb();
    const past = new Date(Date.now() - 1000).toISOString();
    if (to === "shipped") await db.query(`UPDATE sim_supplier_orders SET ship_after = $2 WHERE ref = $1`, [ref, past]);
    else await db.query(`UPDATE sim_supplier_orders SET ship_after = $2, deliver_after = $2 WHERE ref = $1`, [ref, past]);
  }
}
