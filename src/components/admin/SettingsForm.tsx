"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OperatingSettings, SimulatorSettings } from "@/lib/settings";

async function send(url: string, method: string, body: unknown) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message ?? "Failed");
  return j;
}

const NUMERIC: { key: keyof OperatingSettings; label: string; cents?: boolean; min?: number; hint?: string }[] = [
  { key: "maxOrderSupplierCents", label: "Per-order supplier spend limit", cents: true },
  { key: "dailySpendLimitCents", label: "Daily supplier spend limit", cents: true },
  { key: "minContributionCents", label: "Minimum contribution per order", cents: true },
  { key: "serviceFeeFlatCents", label: "Service fee (flat)", cents: true },
  { key: "serviceFeePercent", label: "Service fee (% of supplier total)" },
  { key: "quoteTtlMinutes", label: "Quote validity (minutes)" },
  { key: "maxProcurementAttempts", label: "Max procurement attempts" },
  { key: "digestIntervalHours", label: "Exception digest interval (hours)" },
  { key: "deliveryGraceDays", label: "Delivery delay grace (days)" },
  { key: "authEscalateAfterHours", label: "Escalate uncaptured authorization after (hours)" },
];

export default function SettingsForm({ settings, sim, parts, colors }: { settings: OperatingSettings; sim: SimulatorSettings; parts: { id: string; name: string; bl: string }[]; colors: { id: string; name: string; bl: number }[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg(ok);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
      {msg && <p className="notice" style={{ gridColumn: "1 / -1" }}>{msg}</p>}
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const patch: Record<string, unknown> = { condition: f.get("condition") };
          for (const n of NUMERIC) {
            const v = Number(f.get(n.key));
            patch[n.key] = n.cents ? Math.round(v * 100) : v;
          }
          run(() => send("/api/admin/settings", "PUT", patch), "Operating settings saved.");
        }}
      >
        <h2>Operating limits</h2>
        {NUMERIC.map((n) => (
          <div className="field" key={n.key}>
            <label htmlFor={n.key}>
              {n.label}
              {n.cents ? " (USD)" : ""}
            </label>
            <input id={n.key} name={n.key} type="number" step={n.cents ? "0.01" : "1"} min={n.min ?? 0} defaultValue={n.cents ? (settings[n.key] as number) / 100 : (settings[n.key] as number)} aria-describedby={n.hint ? `${n.key}-hint` : undefined} />
            {n.hint && (
              <span id={`${n.key}-hint`} className="small muted">
                {n.hint}
              </span>
            )}
          </div>
        ))}
        <div className="field">
          <label htmlFor="condition">Part condition</label>
          <select id="condition" name="condition" defaultValue={settings.condition}>
            <option value="N">New</option>
            <option value="U">Used</option>
          </select>
        </div>
        <button className="btn primary">Save limits</button>
      </form>

      <div className="stack">
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const fault = String(f.get("fault") ?? "");
            run(
              () =>
                send("/api/admin/simulator", "PUT", {
                  nextPurchaseFault: fault || null,
                  priceDriftPercent: Number(f.get("drift")),
                  outOfStock: String(f.get("oos") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
                  nextAuthorizationDeclined: f.get("decline") === "on",
                  nextCaptureFails: f.get("capfail") === "on",
                }),
              "Simulator updated.",
            );
          }}
        >
          <h2>Simulator fault injection</h2>
          <p className="small muted">Simulation only. Use these to exercise the exception paths.</p>
          <div className="field">
            <label htmlFor="fault">Next purchase</label>
            <select id="fault" name="fault" defaultValue={sim.nextPurchaseFault ?? ""}>
              <option value="">Succeeds</option>
              <option value="timeout_placed">Times out (order WAS placed)</option>
              <option value="timeout_not_placed">Times out (order NOT placed)</option>
              <option value="partial">Partially filled</option>
              <option value="error">Rejected by supplier</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="drift">Supplier price drift (%)</label>
            <input id="drift" name="drift" type="number" min="-50" max="200" defaultValue={sim.priceDriftPercent} />
          </div>
          <div className="field">
            <label htmlFor="oos">Out of stock (partId|colorId, comma separated)</label>
            <input id="oos" name="oos" type="text" defaultValue={sim.outOfStock.join(", ")} placeholder="slope-45-2x4|red" />
          </div>
          <label className="row small">
            <input type="checkbox" name="decline" defaultChecked={sim.nextAuthorizationDeclined} /> Decline next payment authorization
          </label>
          <label className="row small" style={{ marginBottom: 12 }}>
            <input type="checkbox" name="capfail" defaultChecked={sim.nextCaptureFails} /> Fail next payment capture
          </label>
          <button className="btn">Update simulator</button>
        </form>

        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(
              () =>
                send("/api/admin/mappings", "POST", {
                  partId: f.get("partId"),
                  colorId: f.get("colorId"),
                  externalItemId: f.get("item"),
                  externalColorId: Number(f.get("color")),
                  status: f.get("status"),
                  source: f.get("source"),
                }),
              "Mapping saved.",
            );
          }}
        >
          <h2>Verify a part/color mapping</h2>
          <p className="small muted">Record a mapping as verified only with evidence (catalog URL checked, or supplier agreement reference).</p>
          <div className="field">
            <label htmlFor="partId">Part</label>
            <select id="partId" name="partId">
              {parts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.bl})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="colorId">Color</label>
            <select id="colorId" name="colorId">
              {colors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.bl})
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <input name="item" type="text" placeholder="BrickLink item no." aria-label="BrickLink item number" required style={{ flex: 1 }} />
            <input name="color" type="number" placeholder="BL color id" aria-label="BrickLink color id" required style={{ maxWidth: 130 }} />
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="status">Status</label>
            <select id="status" name="status">
              <option value="verified">verified</option>
              <option value="unresolved">unresolved (block)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="source">Evidence / source</label>
            <input id="source" name="source" type="text" required minLength={8} />
          </div>
          <button className="btn">Save mapping</button>
        </form>
      </div>
    </div>
  );
}
