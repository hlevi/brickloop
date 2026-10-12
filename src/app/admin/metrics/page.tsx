import AdminNav from "@/components/admin/AdminNav";
import { adminPage } from "@/lib/adminGuard";
import { formatCents, statusLabel } from "@/lib/format";
import { pilotMetrics } from "@/lib/metrics";

const pct = (v: number | null) => (v === null ? "n/a" : `${Math.round(v * 100)}%`);

export default async function Metrics() {
  await adminPage();
  const m = await pilotMetrics();
  const kpis: [string, string][] = [
    ["Designs started", String(m.designs)],
    ["Design-to-checkout conversion", pct(m.designToCheckoutConversion)],
    ["Quote requests (not demand)", String(m.quoteRequests)],
    ["Paid orders", `${m.paidOrders} (${m.paidOrdersSimulated} simulated)`],
    ["Delivered orders", String(m.deliveredOrders)],
    ["Intervention-free completion", pct(m.interventionFreeRate)],
    ["Owner minutes (total)", String(m.ownerMinutesTotal)],
    ["Owner minutes per order", m.ownerMinutesPerOrder === null ? "n/a" : m.ownerMinutesPerOrder.toFixed(1)],
    ["Landed supplier cost", formatCents(m.landedCostCents)],
    ["Contribution per order", m.contributionPerOrderCents === null ? "n/a" : formatCents(m.contributionPerOrderCents)],
    ["Delivered on time / late", `${m.deliveryOnTime} / ${m.deliveryLate}`],
    ["Missing-piece complaints", String(m.missingPieceComplaints)],
  ];
  return (
    <div className="stack">
      <h1>Pilot metrics</h1>
      <AdminNav />
      <p className="notice sim small">
        All current orders are simulated: these numbers exercise the reporting but are not evidence of demand or real costs. Pilot new-part costs do not establish future
        reuse economics.
      </p>
      <div className="kpis">
        {kpis.map(([k, v]) => (
          <div className="panel kpi" key={k}>
            <div className="v">{v}</div>
            <div className="k">{k}</div>
          </div>
        ))}
      </div>
      <section className="panel">
        <h2>Exceptions by kind</h2>
        <table>
          <thead>
            <tr>
              <th>Kind</th>
              <th className="num">Open</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {m.exceptions.map((e) => (
              <tr key={e.kind}>
                <td>{statusLabel(e.kind)}</td>
                <td className="num">{e.open}</td>
                <td className="num">{e.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
