/**
 * Run one complete SIMULATED order headlessly against an in-memory database
 * and print each state. Nothing is purchased, charged or shipped.
 *   npm run demo:order
 */
process.env.BRICKLOOP_QUIET = "1";
import crypto from "node:crypto";
import { getDb, resetDbForTests } from "../src/lib/db";
import { createDesign, applyEdits } from "../src/lib/designs";
import { drainJobs } from "../src/lib/jobs/worker";
import { acceptQuote, createOrder, getCustomerOrder } from "../src/lib/orders/service";
import { SimulatorSupplier } from "../src/lib/suppliers/simulator";
import { formatCents } from "../src/lib/format";

await resetDbForTests();
const db = await getDb();
const runAll = async () => {
  for (let i = 0; i < 10; i++) {
    await db.query(`UPDATE jobs SET run_at = now() WHERE status = 'queued'`);
    await drainJobs(5);
  }
};
const customer = crypto.randomUUID();
const designId = await createDesign(customer, "house");
await applyEdits(customer, designId, [{ name: "set_house_width", input: { width: 10 } }, { name: "set_color", input: { component: "roof", color: "blue" } }], "visual");
console.log("Design created and customized (10-stud house, blue roof).");
const orderId = await createOrder(customer, {
  designId,
  adultConfirmed: true,
  contact: { name: "Demo Buyer", email: "demo@example.com", shipTo: { line1: "1 Demo St", city: "Springfield", region: "IL", postalCode: "62701", country: "US" } },
});
await runAll();
let v = await getCustomerOrder(customer, orderId);
const q = v.quote!;
console.log(`Order ${orderId} -> ${v.order.status} [${v.order.mode}]`);
console.log(`  Quote: parts ${formatCents(q.parts_cents)}, picking ${formatCents(q.picking_cents)}, packaging ${formatCents(q.packaging_cents)}, shipping ${formatCents(q.shipping_cents)}, tax ${formatCents(q.tax_cents)}, fee ${formatCents(q.service_fee_cents)} = ${formatCents(q.customer_total_cents)}`);
await acceptQuote(customer, orderId, { quoteId: q.id, paymentMethod: "sim_ok" });
await runAll();
v = await getCustomerOrder(customer, orderId);
console.log(`Accepted -> ${v.order.status}; payment ${v.payment?.status} ${formatCents(v.payment?.captured_cents ?? 0)}`);
const sim = new SimulatorSupplier();
await sim.fastForward(v.shipments[0].supplier_order_ref!, "delivered");
await runAll();
v = await getCustomerOrder(customer, orderId);
console.log(`Carrier update -> ${v.order.status}; tracking ${v.shipments[0].carrier} ${v.shipments[0].tracking_number}`);
console.log(`History: ${v.history.map((h) => h.to_status).join(" -> ")}`);
const ex = await db.query(`SELECT COUNT(*)::int AS n FROM exceptions`);
console.log(`Exceptions raised: ${ex.rows[0].n} (routine order, no owner intervention)`);
await db.close();
