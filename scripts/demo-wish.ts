/**
 * Run the Creature Lab wish flow headlessly against an in-memory database: a kid
 * invents a creature and makes a wish, a grown-up claims and orders it at the
 * fixed price, and the kid's status follows the SIMULATED order to delivery.
 * Nothing is purchased, charged or shipped.
 *   npm run demo:wish
 */
process.env.BRICKLOOP_QUIET = "1";
import crypto from "node:crypto";
import { getDb, resetDbForTests } from "../src/lib/db";
import { applyEdits, createDesign } from "../src/lib/designs";
import { drainJobs } from "../src/lib/jobs/worker";
import { acceptQuote, createOrder, getCustomerOrder } from "../src/lib/orders/service";
import { SimulatorSupplier } from "../src/lib/suppliers/simulator";
import { formatCents } from "../src/lib/format";
import { claimWish, createWish, getWishForGrownup, kidStatus } from "../src/lib/wishes";

await resetDbForTests();
const db = await getDb();
const runAll = async () => {
  for (let i = 0; i < 10; i++) {
    await db.query(`UPDATE jobs SET run_at = now() WHERE status = 'queued'`);
    await drainJobs(5);
  }
};
const showKid = async (code: string) => {
  const s = await kidStatus(kid, code);
  return `${s.stage}${s.slow ? " (taking a little longer)" : ""}`;
};

// Kid device: an anonymous cookie, no personal data.
const kid = crypto.randomUUID();
const designId = await createDesign(kid, "creature");
await applyEdits(
  kid,
  designId,
  [
    { name: "set_option", input: { option: "legs", value: "wheels" } },
    { name: "set_option", input: { option: "back", value: "wings" } },
    { name: "set_color", input: { component: "skin", color: "red" } },
    { name: "set_color", input: { component: "core", color: "trans-yellow" } },
    { name: "set_identity", input: { name: [0, 0, 0], builder: [0, 0, 32] } },
  ],
  "visual",
);
const wish = await createWish(kid, designId, "invented");
console.log(`Kid invented ${wish.name} (by ${wish.builder}) and tapped "Show a grown-up": wish code ${wish.code}`);
console.log(`  Kid sees: ${await showKid(wish.code)}`);

// Grown-up device: a different cookie.
const adult = crypto.randomUUID();
const g = await getWishForGrownup(wish.code);
console.log(`Grown-up opened the code: ${g.pieces} pieces, ${g.steps.length} steps, about ${g.buildMinutes} min, ${g.ageBand}, ${formatCents(g.priceCents)}${g.simulated ? " [SIMULATED]" : ""}`);
console.log(`  Kid sees: ${await showKid(wish.code)}`);
const { designId: copyId } = await claimWish(adult, wish.code);
const orderId = await createOrder(adult, {
  designId: copyId,
  adultConfirmed: true,
  contact: { name: "Demo Buyer", email: "demo@example.com", shipTo: { line1: "1 Demo St", city: "Springfield", region: "IL", postalCode: "62701", country: "US" } },
});
await runAll();
let v = await getCustomerOrder(adult, orderId);
console.log(`Order ${orderId} -> ${v.order.status} [${v.order.mode}], quote ${formatCents(v.quote!.customer_total_cents)} (fixed price)`);
console.log(`  Kid sees: ${await showKid(wish.code)}`);
await acceptQuote(adult, orderId, { quoteId: v.quote!.id, paymentMethod: "sim_ok" });
await runAll();
v = await getCustomerOrder(adult, orderId);
console.log(`Accepted -> ${v.order.status}; payment ${v.payment?.status} ${formatCents(v.payment?.captured_cents ?? 0)}`);
console.log(`  Kid sees: ${await showKid(wish.code)}`);
const sim = new SimulatorSupplier();
await sim.fastForward(v.shipments[0].supplier_order_ref!, "delivered");
await runAll();
v = await getCustomerOrder(adult, orderId);
console.log(`Carrier update -> ${v.order.status}; tracking ${v.shipments[0].carrier} ${v.shipments[0].tracking_number}`);
console.log(`  Kid sees: ${await showKid(wish.code)}`);
const ex = await db.query(`SELECT COUNT(*)::int AS n FROM exceptions`);
console.log(`Exceptions raised: ${ex.rows[0].n}`);
await db.close();
