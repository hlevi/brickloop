"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatCents } from "@/lib/format";

/** Adult purchaser checkout. With `fixedPriceCents` (Creature Lab) there is no budget: the quote is always that price. */
export default function CheckoutForm({ designId, fixedPriceCents }: { designId: string; fixedPriceCents?: number }) {
  const fixed = typeof fixedPriceCents === "number";
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        const f = new FormData(e.currentTarget);
        const get = (k: string) => String(f.get(k) ?? "").trim();
        const budget = fixed ? "" : get("budget");
        setBusy(true);
        const r = await fetch("/api/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            designId,
            adultConfirmed: f.get("adult") === "on",
            budgetCents: budget ? Math.round(Number(budget) * 100) : undefined,
            contact: {
              name: get("name"),
              email: get("email"),
              shipTo: { name: get("name"), line1: get("line1"), line2: get("line2"), city: get("city"), region: get("region"), postalCode: get("postalCode"), country: get("country") },
            },
          }),
        });
        const j = await r.json().catch(() => ({}));
        setBusy(false);
        if (!r.ok) return setErr(j.message ?? "Could not start checkout");
        router.push(`/orders/${j.id}`);
      }}
    >
      <h2>Purchaser (adult) and delivery</h2>
      <p className="small muted">We only need the purchasing adult&apos;s details. Please don&apos;t enter any information about children.</p>
      <div className="field">
        <label htmlFor="name">Full name</label>
        <input id="name" name="name" type="text" autoComplete="name" required maxLength={200} />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={200} />
      </div>
      <div className="field">
        <label htmlFor="line1">Address</label>
        <input id="line1" name="line1" type="text" autoComplete="address-line1" required maxLength={200} />
        <input name="line2" type="text" autoComplete="address-line2" maxLength={200} aria-label="Address line 2" placeholder="Apartment, suite (optional)" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        <div className="field">
          <label htmlFor="city">City</label>
          <input id="city" name="city" type="text" autoComplete="address-level2" required />
        </div>
        <div className="field">
          <label htmlFor="region">State / region</label>
          <input id="region" name="region" type="text" autoComplete="address-level1" required />
        </div>
        <div className="field">
          <label htmlFor="postalCode">Postal code</label>
          <input id="postalCode" name="postalCode" type="text" autoComplete="postal-code" required />
        </div>
        <div className="field">
          <label htmlFor="country">Country (2-letter)</label>
          <input id="country" name="country" type="text" autoComplete="country" required maxLength={2} defaultValue="US" />
        </div>
      </div>
      {fixed ? (
        <p className="small" style={{ marginTop: 0 }}>
          <strong>{formatCents(fixedPriceCents)}</strong> fixed price, includes delivery and taxes. The confirmed quote will be exactly this amount.
        </p>
      ) : (
        <div className="field">
          <label htmlFor="budget">Budget (optional, USD)</label>
          <input id="budget" name="budget" type="number" min="1" step="1" style={{ maxWidth: 160 }} />
        </div>
      )}
      <label className="row small" style={{ marginBottom: 14 }}>
        <input type="checkbox" name="adult" required /> I am 18 or older and I am the purchaser.
      </label>
      {err && <p className="error">{err}</p>}
      <button className="btn primary" disabled={busy}>
        {busy ? "Requesting quote..." : fixed ? `Continue at ${formatCents(fixedPriceCents)}` : "Request confirmed quote"}
      </button>
    </form>
  );
}
