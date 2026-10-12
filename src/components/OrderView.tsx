"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { renderIso, toSvg } from "@/lib/instructions/iso";
import { renderBuilder, renderName } from "@/lib/creature/words";
import { formatCents, statusLabel } from "@/lib/format";
import type { CustomerOrderView, QuoteRow } from "@/lib/orders/service";
import type { EnvironmentalReport } from "@/lib/environment";

type Data = CustomerOrderView & { environmental: EnvironmentalReport };

const STEPS = ["validating", "quoting", "awaiting_acceptance", "payment_authorized", "procuring", "purchased", "shipped", "delivered"];
const ACTIVE = new Set(["draft", "validating", "quoting", "payment_authorized", "procuring", "purchased", "shipped", "exception"]);

const STATUS_TEXT: Record<string, string> = {
  validating: "Checking that the design builds correctly...",
  quoting: "Requesting a complete quote from the supplier...",
  awaiting_acceptance: "Your confirmed quote is ready. Review and accept it below.",
  payment_authorized: "Payment authorized (not yet charged). Re-checking price and stock, then purchasing parts...",
  procuring: "Purchasing your parts from the supplier...",
  purchased: "Parts purchased. Waiting for the supplier to ship.",
  shipped: "On its way.",
  delivered: "Delivered.",
  exception: "We're resolving an issue with this order. You won't be charged anything extra without your approval.",
  canceled: "Canceled. Any payment authorization was released.",
  refunded: "Refunded.",
};

export default function OrderView({ orderId }: { orderId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState("sim_ok");
  const load = useCallback(async () => {
    const r = await fetch(`/api/orders/${orderId}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setErr(j.message ?? "Order not found");
    else setData(j);
  }, [orderId]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!data || !ACTIVE.has(data.order.status)) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [data, load]);
  const svg = useMemo(() => (data ? toSvg(renderIso(data.model.parts, { showFrontCue: true }), { width: 360 }) : ""), [data]);

  if (err) return <p className="error">{err}</p>;
  if (!data) return <p className="muted">Loading order...</p>;
  const o = data.order;
  const sim = o.mode === "simulated";
  // Creature Lab orders carry one fixed price (incl. delivery and taxes) and the creature's generated name.
  const fixed = o.fixed_price_cents !== null && o.fixed_price_cents !== undefined;
  const identity = data.model.params.identity;
  const act = async (path: string, body: unknown) => {
    setBusy(true);
    setActionErr(null);
    const r = await fetch(`/api/orders/${orderId}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setActionErr(j.message ?? "Request failed");
    setBusy(false);
    await load();
    return r.ok;
  };
  const stepIdx = STEPS.indexOf(o.status === "exception" ? (o.held_from_status ?? "") : o.status);

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        {fixed && identity ? (
          <div>
            <h1 style={{ margin: 0 }}>{renderName(identity)}</h1>
            <p className="small muted" style={{ margin: 0 }}>
              Invented by <strong>{renderBuilder(identity)}</strong> &middot; order <span className="mono">{o.id.slice(0, 8)}</span>
            </p>
          </div>
        ) : (
          <h1 style={{ margin: 0 }}>
            Order <span className="mono">{o.id.slice(0, 8)}</span>
          </h1>
        )}
        <div className="row">
          {sim && <span className="badge sim">SIMULATED ORDER</span>}
          <span className="badge info">{statusLabel(o.status)}</span>
          <span className="badge ok">Parts: {o.environmental_label}</span>
        </div>
      </div>
      {sim && <div className="notice sim small">This is a simulated order. The quote, payment, purchase, tracking and delivery are produced by simulators. No money moves and nothing ships.</div>}
      <div className={`notice ${o.status === "exception" ? "bad" : "ok"}`}>{STATUS_TEXT[o.status] ?? statusLabel(o.status)}</div>
      {data.openIssues.length > 0 && (
        <ul className="small">
          {data.openIssues.map((i, n) => (
            <li key={n}>{i.cause}</li>
          ))}
        </ul>
      )}
      <ol className="row small" aria-label="Progress" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {STEPS.map((s, i) => (
          <li key={s} className={`badge ${i <= stepIdx ? "ok" : ""}`} style={{ opacity: i <= stepIdx ? 1 : 0.45 }}>
            {statusLabel(s)}
          </li>
        ))}
      </ol>

      <div className="editor">
        <div className="stack">
          {o.status === "awaiting_acceptance" && data.quote && (
            <QuoteBox quote={data.quote} sim={sim} fixed={fixed} budget={o.budget_cents} method={method} setMethod={setMethod} busy={busy} onAccept={() => act("accept", { quoteId: data.quote!.id, paymentMethod: method })} />
          )}
          {fixed && !data.acceptedQuote && o.status !== "awaiting_acceptance" && !["canceled", "refunded"].includes(o.status) && (
            <section className="panel">
              <p style={{ margin: 0, fontSize: "1.6rem", fontWeight: 900 }}>{formatCents(o.fixed_price_cents!)}</p>
              <p style={{ margin: 0, fontWeight: 700 }}>Fixed price, includes delivery and taxes</p>
              <p className="small muted" style={{ marginBottom: 0 }}>
                We confirm the exact parts with the supplier before asking you to accept this price. {sim && <span className="badge sim">SIMULATION</span>}
              </p>
            </section>
          )}
          {data.acceptedQuote && o.status !== "awaiting_acceptance" && <QuoteTable quote={data.acceptedQuote} title="Accepted quote" fixed={fixed} />}
          {actionErr && <p className="error">{actionErr}</p>}
          {data.payment && (
            <section className="panel small">
              <h2>Payment</h2>
              <p style={{ margin: 0 }}>
                {statusLabel(data.payment.status)} &middot; authorized {formatCents(data.payment.amount_cents)} &middot; charged {formatCents(data.payment.captured_cents)}
                {data.payment.refunded_cents > 0 && <> &middot; refunded {formatCents(data.payment.refunded_cents)}</>} {data.payment.mode === "simulated" && <span className="badge sim">sandbox</span>}
              </p>
            </section>
          )}
          {data.shipments.length > 0 && (
            <section className="panel small">
              <h2>Shipment</h2>
              {data.shipments.map((s, i) => (
                <div key={i}>
                  <p style={{ margin: "0 0 6px" }}>
                    Supplier order <span className="mono">{s.supplier_order_ref}</span> &middot; {statusLabel(s.shipping_status ?? s.status)}
                    {s.tracking_number && (
                      <>
                        {" "}
                        &middot; {s.carrier} <span className="mono">{s.tracking_number}</span>
                      </>
                    )}
                  </p>
                  <ul className="timeline">
                    {((s.tracking_events as { at: string; description: string }[]) ?? []).map((e, j) => (
                      <li key={j}>
                        {new Date(e.at).toLocaleString()}: {e.description}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
          <section className="panel small">
            <h2>History</h2>
            <ul className="timeline">
              {data.history.map((h, i) => (
                <li key={i}>
                  <strong>{statusLabel(h.to_status)}</strong> <span className="muted">{new Date(h.at).toLocaleString()}</span>
                  {h.reason && <div className="muted">{h.reason}</div>}
                </li>
              ))}
            </ul>
          </section>
        </div>
        <div className="stack">
          <section className="panel">
            <div className="preview" style={{ background: "linear-gradient(180deg,#fbfaf7,#efede6)", borderRadius: 10, display: "flex", justifyContent: "center", padding: 8 }} dangerouslySetInnerHTML={{ __html: svg }} />
            <p className="small">
              {o.frozen_bom.totalPieces} pieces &middot; design frozen at checkout &middot;{" "}
              <a href={`/api/orders/${orderId}/instructions`} target="_blank" rel="noreferrer">
                Building instructions (PDF)
              </a>
            </p>
          </section>
          <section className="panel small">
            <h2>Environmental note</h2>
            <p style={{ marginTop: 0 }}>{data.environmental.statement}</p>
            <p className="muted" style={{ marginBottom: 0 }}>
              Part-weight data available for {data.environmental.weightCoverage.linesWithWeight} of {data.environmental.weightCoverage.totalLines} lines. {data.environmental.carbonComparison.reason}
            </p>
          </section>
          <CustomerActions status={o.status} busy={busy} act={act} />
        </div>
      </div>
    </div>
  );
}

function QuoteTable({ quote, title, fixed = false }: { quote: QuoteRow; title: string; fixed?: boolean }) {
  return (
    <section className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        {quote.mode === "simulated" && <span className="badge sim">simulated supplier quote</span>}
      </div>
      <table className="price-table">
        <tbody>
          <tr>
            <td>Parts ({quote.condition === "N" ? "new" : "used"}, exact parts and colors, no substitutions)</td>
            <td>{formatCents(quote.parts_cents)}</td>
          </tr>
          <tr>
            <td>Picking &amp; processing</td>
            <td>{formatCents(quote.picking_cents)}</td>
          </tr>
          <tr>
            <td>Packaging</td>
            <td>{formatCents(quote.packaging_cents)}</td>
          </tr>
          <tr>
            <td>Shipping</td>
            <td>{formatCents(quote.shipping_cents)}</td>
          </tr>
          <tr>
            <td>Taxes</td>
            <td>{formatCents(quote.tax_cents)}</td>
          </tr>
          <tr>
            <td>BrickLoop service fee</td>
            <td>{formatCents(quote.service_fee_cents)}</td>
          </tr>
          <tr className="total">
            <td>{fixed ? "Fixed price, includes delivery and taxes" : "Total"}</td>
            <td>{formatCents(quote.customer_total_cents)}</td>
          </tr>
        </tbody>
      </table>
      {fixed && (
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          One fixed price for every creature. The lines above show what the supplier charges for the exact parts, shipping and taxes; your price stays the same.
        </p>
      )}
      <p className="small muted" style={{ marginBottom: 0 }}>
        Delivery in {quote.delivery_days_min}-{quote.delivery_days_max} days after purchase. Quote valid until {new Date(quote.expires_at).toLocaleString()}.
      </p>
    </section>
  );
}

function QuoteBox(props: { quote: QuoteRow; sim: boolean; fixed: boolean; budget: number | null; method: string; setMethod: (m: string) => void; busy: boolean; onAccept: () => void }) {
  const { quote, sim, budget, fixed } = props;
  const expired = new Date(quote.expires_at).getTime() < Date.now();
  return (
    <div className="stack">
      <QuoteTable quote={quote} title="Your confirmed quote" fixed={fixed} />
      {budget !== null && quote.customer_total_cents > budget && (
        <p className="notice small">This quote is above your budget of {formatCents(budget)}. You can go back to the design and use the budget suggestions.</p>
      )}
      <section className="panel">
        <h2>Accept and authorize payment</h2>
        <p className="small muted">
          We place a hold for this amount now and charge it only after the parts are purchased. If the supplier&apos;s price goes up before purchase, we ask you again;
          we never charge more than you accept.
        </p>
        {sim && (
          <div className="field">
            <label htmlFor="method">Sandbox payment method (simulation)</label>
            <select id="method" value={props.method} onChange={(e) => props.setMethod(e.target.value)}>
              <option value="sim_ok">Test card: approves</option>
              <option value="sim_decline">Test card: declined</option>
              <option value="sim_capture_fail">Test card: capture will fail</option>
            </select>
          </div>
        )}
        <button className="btn primary" disabled={props.busy || expired} onClick={props.onAccept}>
          {expired ? "Quote expired" : fixed ? `Accept fixed price ${formatCents(quote.customer_total_cents)}` : `Accept ${formatCents(quote.customer_total_cents)}`}
        </button>
      </section>
    </div>
  );
}

function CustomerActions({ status, busy, act }: { status: string; busy: boolean; act: (path: string, body: unknown) => Promise<boolean> }) {
  const [reason, setReason] = useState("");
  const [missing, setMissing] = useState("");
  const [done, setDone] = useState<string | null>(null);
  if (["canceled", "refunded"].includes(status)) return null;
  const post = ["shipped", "delivered"].includes(status);
  return (
    <section className="panel small">
      <h2>{post ? "Problems with your order" : "Cancel order"}</h2>
      {done && <p className="notice ok">{done}</p>}
      {post && (
        <div className="field">
          <label htmlFor="missing">Report missing pieces</label>
          <textarea id="missing" rows={2} value={missing} onChange={(e) => setMissing(e.target.value)} maxLength={1000} />
          <button className="btn small" disabled={busy || missing.trim().length < 3} onClick={async () => (await act("complaint", { details: missing })) && (setMissing(""), setDone("Thanks, we recorded the missing pieces."))}>
            Report
          </button>
        </div>
      )}
      <div className="field">
        <label htmlFor="reason">{post ? "Request a refund" : "Reason (optional)"}</label>
        <input id="reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        <button className="btn small danger" disabled={busy} onClick={async () => (await act("cancel", { reason })) && setDone("Your request was recorded.")}>
          {post ? "Request refund" : "Cancel order"}
        </button>
      </div>
    </section>
  );
}
