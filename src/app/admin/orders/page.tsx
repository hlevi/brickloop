import AdminNav from "@/components/admin/AdminNav";
import JsonAction from "@/components/admin/JsonAction";
import { adminPage } from "@/lib/adminGuard";
import { adminOrders, orderAudit } from "@/lib/admin";
import { formatCents, statusLabel } from "@/lib/format";

export default async function AdminOrders(props: { searchParams: Promise<{ focus?: string }> }) {
  await adminPage();
  const { focus } = await props.searchParams;
  const orders = await adminOrders();
  const audit = focus && /^[0-9a-f-]{36}$/.test(focus) ? await orderAudit(focus) : [];
  return (
    <div className="stack">
      <h1>Orders</h1>
      <AdminNav />
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Design</th>
              <th>Status</th>
              <th>Supplier</th>
              <th>Payment</th>
              <th className="num">Total</th>
              <th>Simulator</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} style={o.id === focus ? { background: "color-mix(in srgb, var(--accent) 10%, transparent)" } : undefined}>
                <td>
                  <a className="mono" href={`/admin/orders?focus=${o.id}`}>
                    {o.id.slice(0, 8)}
                  </a>{" "}
                  {o.mode === "simulated" && <span className="badge sim">sim</span>} {o.open_exceptions > 0 && <span className="badge bad">{o.open_exceptions} open</span>}
                </td>
                <td>{o.design_name}</td>
                <td>{statusLabel(o.status)}</td>
                <td>{o.supplier_status ?? "-"}</td>
                <td>{o.payment_status ?? "-"}</td>
                <td className="num">{o.accepted_total_cents ? formatCents(o.accepted_total_cents) : "-"}</td>
                <td>
                  {o.mode === "simulated" && o.status === "purchased" && <JsonAction url="/api/admin/advance" body={{ orderId: o.id, to: "shipped" }} label="Ship now" />}{" "}
                  {o.mode === "simulated" && ["purchased", "shipped"].includes(o.status) && <JsonAction url="/api/admin/advance" body={{ orderId: o.id, to: "delivered" }} label="Deliver now" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {focus && (
        <section className="panel small">
          <h2>
            Audit trail <span className="mono">{focus.slice(0, 8)}</span>
          </h2>
          <ul className="timeline">
            {audit.map((a, i) => (
              <li key={i}>
                <strong>{a.action}</strong> by {a.actor} <span className="muted">{new Date(a.at).toLocaleString()}</span>
                <div className="mono muted">{JSON.stringify(a.data)}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
