import Link from "next/link";
import { getCustomerId } from "@/lib/http";
import { listCustomerOrders } from "@/lib/orders/service";
import { formatCents, statusLabel } from "@/lib/format";

export default async function Orders() {
  const cid = await getCustomerId(false);
  const orders = cid ? await listCustomerOrders(cid) : [];
  return (
    <div className="stack">
      <h1>My orders</h1>
      {orders.length === 0 ? (
        <p className="muted">No orders yet.</p>
      ) : (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Design</th>
                <th>Status</th>
                <th className="num">Total</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/orders/${o.id}`} className="mono">
                      {o.id.slice(0, 8)}
                    </Link>{" "}
                    {o.mode === "simulated" && <span className="badge sim">simulated</span>}
                  </td>
                  <td>{o.name}</td>
                  <td>{statusLabel(o.status)}</td>
                  <td className="num">
                    {o.accepted_total_cents ? formatCents(o.accepted_total_cents) : o.fixed_price_cents ? <span title="Fixed price, includes delivery and taxes">{formatCents(o.fixed_price_cents)} fixed</span> : "-"}
                  </td>
                  <td>{new Date(o.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
