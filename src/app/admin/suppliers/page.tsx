import AdminNav from "@/components/admin/AdminNav";
import { adminPage } from "@/lib/adminGuard";
import { env } from "@/lib/config";
import { allSuppliers } from "@/lib/suppliers/registry";

export default async function Suppliers() {
  await adminPage();
  const ops = ["quote", "purchase", "lookupOrder", "cancel", "tracking"] as const;
  return (
    <div className="stack">
      <h1>Supplier capabilities</h1>
      <AdminNav />
      <p className="small">
        Active supplier: <strong>{env.supplier}</strong> &middot; allowlist: <span className="mono">{env.supplierAllowlist.join(", ")}</span>. Full report: docs/SUPPLIER_CAPABILITIES.md.
      </p>
      {allSuppliers().map((s) => (
        <section className="panel" key={s.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>{s.name}</h2>
            <span className={`badge ${s.capabilityStatus === "verified" ? "ok" : s.capabilityStatus === "simulated" ? "sim" : "warn"}`}>{s.capabilityStatus}</span>
          </div>
          <div className="row small" style={{ margin: "8px 0" }}>
            {ops.map((o) => (
              <span key={o} className={`badge ${s.capabilities[o] ? "ok" : "bad"}`}>
                {o}: {s.capabilities[o] ? "yes" : "no"}
              </span>
            ))}
          </div>
          <ul className="small">
            {s.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          {s.documentation.length > 0 && (
            <ul className="small muted">
              {s.documentation.map((d) => (
                <li key={d.url}>
                  {d.url}: checked {d.checkedOn}. {d.outcome}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
