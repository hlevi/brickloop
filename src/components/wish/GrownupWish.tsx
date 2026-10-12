"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import CreatureCard from "@/components/lab/CreatureCard";
import { formatCents } from "@/lib/format";
import { renderIso, toSvg } from "@/lib/instructions/iso";
import type { GrownupWish as WishData } from "@/lib/wishes";
import AgeGate from "./AgeGate";
import { noteSticker } from "./notes";
import "./wish.css";

const BrickViewer = dynamic(() => import("@/components/BrickViewer"), { ssr: false, loading: () => <div className="viewer wg-viewer" /> });

type State = { kind: "age" } | { kind: "loading" } | { kind: "ready"; data: WishData } | { kind: "inactive" } | { kind: "error"; message: string };

/**
 * The grown-up side of a wish: a neutral age screen first, then the creature with
 * the facts a parent checks before buying, one fixed price and one order button.
 * Creature data is fetched only after the age screen, so nothing about the price
 * reaches a device whose user said they are under 18.
 */
export default function GrownupWish({ code }: { code: string }) {
  const [state, setState] = useState<State>({ kind: "age" });
  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const r = await fetch(`/api/wishes/${encodeURIComponent(code)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (r.status === 404) return setState({ kind: "inactive" });
      if (!r.ok) return setState({ kind: "error", message: j.message ?? "Something went wrong. Please try again." });
      setState({ kind: "ready", data: j as WishData });
    } catch {
      setState({ kind: "error", message: "We couldn't reach BrickLoop. Check your connection and try again." });
    }
  }, [code]);

  if (state.kind === "age") return <AgeGate onAdult={load} code={code} />;
  if (state.kind === "loading") return <p className="muted wg-loading">Opening the wish...</p>;
  if (state.kind === "inactive") return <InactiveWish />;
  if (state.kind === "error")
    return (
      <section className="panel wg-gate">
        <p className="error">{state.message}</p>
        <button className="btn" onClick={load}>
          Try again
        </button>
      </section>
    );
  return <GrownupView data={state.data} />;
}

export function InactiveWish() {
  return (
    <section className="panel wg-gate">
      <div className="wg-gate-icon" aria-hidden>
        🔎
      </div>
      <h1>This wish code isn&apos;t active</h1>
      <p className="muted">It may have a typo, or it may be older than 30 days. Ask your young inventor to tap &ldquo;Show a grown-up&rdquo; again for a fresh code.</p>
      <Link className="btn" href="/w">
        Type a code
      </Link>
    </section>
  );
}

export function GrownupView({ data }: { data: WishData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const still = useMemo(() => toSvg(renderIso(data.model.parts), { width: 420 }), [data.model.parts]);
  // The creature sits inside a larger build frame; moving it to the origin lets the
  // 3D view frame the creature itself instead of empty floor (appearance is unchanged).
  const viewParts = useMemo(() => {
    const minX = Math.min(...data.model.parts.map((p) => p.x));
    const minZ = Math.min(...data.model.parts.map((p) => p.z));
    return data.model.parts.map((p) => ({ ...p, x: p.x - minX, z: p.z - minZ }));
  }, [data.model.parts]);
  const note = noteSticker(data.note);
  const orderable = data.validation.digitalCheckPassed && !data.ordered;
  const extras = data.pieces - data.bricks;

  const order = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/wishes/${encodeURIComponent(data.code)}/claim`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.message ?? "Could not start the order. Please try again.");
        setBusy(false);
        return;
      }
      router.push(j.orderId ? `/orders/${j.orderId}` : `/design/${j.designId}/checkout`);
    } catch {
      setErr("We couldn't reach BrickLoop. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <div className="wg">
      <header className="wg-hero">
        <div>
          <p className="wg-eyebrow">A wish from a young inventor &middot; code {data.code}</p>
          <h1 className="wg-name">{data.name}</h1>
          <p className="wg-by">
            Invented by <strong>{data.builder}</strong>
          </p>
        </div>
        <p className="wg-sticker" aria-label={`Note from the inventor: ${note.label}`}>
          <span aria-hidden>{note.icon}</span> {note.label}
        </p>
      </header>

      <div className="wg-grid">
        <div className="wg-col wg-main">
          <section className="panel wg-stage" aria-label="The creature in 3D">
            <div className="viewer wg-viewer">
              <BrickViewer parts={viewParts} />
              <span className="viewer-hint">Drag to turn it</span>
            </div>
          </section>

          <section className="panel wg-still" aria-label="Real bricks">
            <h2>Real bricks</h2>
            <div className="wg-still-art" role="img" aria-label={`Still picture of ${data.name} in real bricks`} dangerouslySetInnerHTML={{ __html: still }} />
            <p className="small muted" style={{ margin: 0 }}>
              What you get looks like this. In the Lab the creature blinks and glows for fun; the real bricks don&apos;t move or light up.
            </p>
          </section>

          <section className="panel wg-build" aria-label="The build">
            <h2>The build</h2>
            <p className="wg-facts">
              <span>
                <strong>{data.pieces}</strong> pieces
                {extras > 0 && (
                  <span className="muted">
                    {" "}
                    ({data.bricks} bricks + {extras} {data.extrasLabel})
                  </span>
                )}
              </span>
              <span>
                <strong>{data.steps.length}</strong> steps
              </span>
              <span>
                about <strong>{data.buildMinutes}</strong> minutes to build
              </span>
            </p>
            <ol className="wg-steps">
              {data.steps.map((s) => (
                <li key={s.index}>
                  <span>{s.title}</span>
                  <span className="muted">{s.pieceCount === 1 ? "1 piece" : `${s.pieceCount} pieces`}</span>
                </li>
              ))}
            </ol>
            <p className="small" style={{ marginBottom: 0 }}>
              <span className="badge info">Suitable {data.ageBand}</span> Contains small parts. Not for children under 3.
            </p>
          </section>
        </div>

        <div className="wg-col wg-side">
          <section className="panel wg-buy" aria-label="Order">
            <p className="wg-price">{formatCents(data.priceCents)}</p>
            <p className="wg-price-label">Fixed price, includes delivery and taxes</p>
            <ul className="wg-glance" aria-label="At a glance">
              <li>
                <span aria-hidden>🧱</span> {data.pieces} pieces, {data.steps.length} steps
              </li>
              <li>
                <span aria-hidden>🛠️</span> about {data.buildMinutes} min to build
              </li>
              <li>
                <span aria-hidden>⚠️</span> Suitable {data.ageBand}, small parts
              </li>
            </ul>
            {data.simulated && (
              <p className="notice sim small wg-sim">
                <span className="badge sim">SIMULATION</span> Orders are simulated right now: no money moves and nothing ships.
              </p>
            )}
            <h2>What arrives</h2>
            <ul className="wg-list">
              <li>One parcel with all {data.pieces} genuine new parts</li>
              <li>A personalized PDF booklet with {data.name} on the cover, a cut-out creature card and a certificate, to print or open on a tablet</li>
            </ul>
            <ul className="wg-trust">
              {data.validation.digitalCheckPassed && (
                <li>
                  <span className="wg-tick ok" aria-hidden>
                    ✓
                  </span>
                  Every brick connects in our digital build check
                </li>
              )}
              <li>
                <span className="wg-tick" aria-hidden>
                  ○
                </span>
                {data.validation.physicallyValidated ? "Physical test build: done for this design" : "Physical test build: not yet done for this design"}
              </li>
            </ul>
            {data.ordered ? (
              <p className="notice ok small">These bricks are already ordered. The grown-up who ordered them can follow the delivery under My orders.</p>
            ) : !data.validation.digitalCheckPassed ? (
              <p className="notice bad small">This creature can&apos;t be ordered right now. Nothing is wrong on your side, and the kid&apos;s design stays safe in the Lab.</p>
            ) : null}
            {orderable && (
              <button className="btn primary wg-order" onClick={order} disabled={busy}>
                {busy ? "One moment..." : "Order these bricks"}
              </button>
            )}
            {err && <p className="error small">{err}</p>}
            {orderable && (
              <p className="small muted" style={{ margin: 0 }}>
                Next: your delivery details and a confirmed supplier quote at this price. Nothing is charged until you accept it.
              </p>
            )}
            <p className="small wg-promise">One price with no add-ons or in-app purchases. We never ask anything about your child.</p>
          </section>

          <div className="wg-card">
            <CreatureCard name={data.name} builder={data.builder} stats={data.stats} parts={data.model.parts} coreColor={data.model.params.colors.core} />
          </div>
        </div>
      </div>
    </div>
  );
}
