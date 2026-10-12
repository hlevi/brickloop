import Link from "next/link";
import AdminNav from "@/components/admin/AdminNav";
import JsonAction from "@/components/admin/JsonAction";
import ResolveForm from "@/components/admin/ResolveForm";
import { adminPage } from "@/lib/adminGuard";
import { recentNotifications } from "@/lib/admin";
import { ACTION_LABELS, listExceptions } from "@/lib/exceptions/service";
import { formatCents, statusLabel } from "@/lib/format";
import { liveReadiness } from "@/lib/orders/live";
import { getSettings } from "@/lib/settings";

export default async function AdminHome() {
  await adminPage();
  const [exceptions, settings, readiness, notes] = await Promise.all([listExceptions("open"), getSettings(), liveReadiness(), recentNotifications(15)]);
  return (
    <div className="stack">
      <h1>Owner dashboard</h1>
      <AdminNav />
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <section className="panel">
          <h2>Purchasing</h2>
          <p>
            {settings.purchasingPaused ? <span className="badge bad">PAUSED</span> : <span className="badge ok">running</span>}{" "}
            {readiness.ready ? <span className="badge bad">LIVE</span> : <span className="badge sim">simulation</span>}
          </p>
          <JsonAction
            url="/api/admin/settings"
            method="PUT"
            body={{ purchasingPaused: !settings.purchasingPaused }}
            label={settings.purchasingPaused ? "Resume purchasing" : "Emergency pause purchasing"}
            className={`btn ${settings.purchasingPaused ? "" : "danger"}`}
            confirm={settings.purchasingPaused ? undefined : "Pause all supplier purchases? Orders will wait until you resume."}
          />
          <p className="small muted">
            Limits: {formatCents(settings.maxOrderSupplierCents)} per order, {formatCents(settings.dailySpendLimitCents)} per day, minimum contribution {formatCents(settings.minContributionCents)}.
          </p>
        </section>
        <section className="panel">
          <h2>Live readiness</h2>
          <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
            {readiness.items.map((i) => (
              <li key={i.id}>
                {i.ok ? "✅" : "⛔"} {i.label} <span className="muted">({i.detail})</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel">
        <h2>Open exceptions ({exceptions.length})</h2>
        {exceptions.length === 0 && <p className="muted">Nothing needs your attention. Routine orders run without owner action.</p>}
        <div className="stack">
          {exceptions.map((e) => (
            <article key={e.id} className="panel" style={{ boxShadow: "none" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>
                  {statusLabel(e.kind)} {e.urgent && <span className="badge bad">urgent</span>} {e.holds_order ? <span className="badge warn">order held</span> : <span className="badge info">informational</span>}
                </strong>
                <span className="small muted">{new Date(e.created_at).toLocaleString()}</span>
              </div>
              <p style={{ margin: "6px 0" }}>{e.cause}</p>
              <p className="small" style={{ margin: "6px 0" }}>
                Order:{" "}
                {e.order_id ? (
                  <Link className="mono" href={`/admin/orders?focus=${e.order_id}`}>
                    {e.order_id.slice(0, 8)}
                  </Link>
                ) : (
                  "-"
                )}{" "}
                &middot; Exposure: <strong>{formatCents(e.exposure_cents)}</strong>
              </p>
              <details className="small">
                <summary>Evidence</summary>
                <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(e.evidence, null, 2)}</pre>
              </details>
              <ResolveForm id={e.id} actions={e.actions.map((a) => ({ id: a, label: ACTION_LABELS[a] }))} />
            </article>
          ))}
        </div>
      </section>

      <section className="panel small">
        <h2>Recent alerts and customer notifications (log channel)</h2>
        <p className="muted">Email delivery is not connected; messages are recorded here. Urgent alerts go to ALERT_EMAIL; non-urgent items are summarized in the digest.</p>
        <div className="table-wrap">
          <table>
            <tbody>
              {notes.map((n) => (
                <tr key={n.id}>
                  <td>
                    <span className={`badge ${n.kind === "urgent" ? "bad" : n.kind === "digest" ? "warn" : "info"}`}>{n.kind}</span>
                  </td>
                  <td>{n.subject}</td>
                  <td className="muted">{new Date(n.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
