import Link from "next/link";
import { notFound } from "next/navigation";
import { getDesignView } from "@/lib/designs";
import { getCustomerId } from "@/lib/http";
import { formatCents } from "@/lib/format";
import { renderIso, toSvg } from "@/lib/instructions/iso";
import { liveReadiness } from "@/lib/orders/live";
import { getSettings } from "@/lib/settings";
import { isUuid } from "@/lib/util";
import { claimedCreature } from "@/lib/wishes";
import CheckoutForm from "@/components/CheckoutForm";
import "@/components/wish/wish.css";

export default async function Checkout(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const cid = await getCustomerId(false);
  const view = cid && isUuid(id) ? await getDesignView(cid, id).catch(() => null) : null;
  if (!view) notFound();

  if (view.lab) {
    // Creature Lab designs reach checkout only as a grown-up's copy made by claiming a wish,
    // and the frozen copy is what gets ordered (never later edits). Kids never get here.
    const c = await claimedCreature(cid!, id);
    if (!c) notFound();
    const [settings, readiness] = await Promise.all([getSettings(), liveReadiness()]);
    const svg = toSvg(renderIso(c.model.parts), { width: 260 });
    return (
      <div className="wg-checkout">
        <p className="wg-eyebrow">
          Order a wish &middot; code {c.code}
        </p>
        <section className="panel wg-summary">
          <div className="wg-summary-art" role="img" aria-label={`${c.name} in real bricks`} dangerouslySetInnerHTML={{ __html: svg }} />
          <div className="wg-summary-text">
            <h1 className="wg-summary-name">{c.name}</h1>
            <p className="wg-by" style={{ marginTop: 0 }}>
              Invented by <strong>{c.builder}</strong>
            </p>
            <p className="small muted" style={{ margin: 0 }}>
              {c.pieces} genuine new pieces &middot; {c.steps} steps &middot; about {c.buildMinutes} minutes to build &middot; Suitable {c.ageBand}, contains small parts
            </p>
            <div className="wg-summary-price">
              <p className="wg-price">{formatCents(settings.creaturePriceCents)}</p>
              <p className="wg-price-label">Fixed price, includes delivery and taxes</p>
            </div>
            {!readiness.ready && (
              <p className="small" style={{ margin: 0 }}>
                <span className="badge sim">SIMULATION</span> Orders are simulated: no money moves and nothing ships.
              </p>
            )}
          </div>
        </section>
        {c.openOrder ? (
          <p className="notice ok">
            These bricks are already ordered.{" "}
            {c.openOrder.mine ? <Link href={`/orders/${c.openOrder.id}`}>Follow the order</Link> : "The grown-up who ordered them can follow it under My orders."}
          </p>
        ) : !c.active ? (
          <p className="notice">This wish code isn&apos;t active any more. Ask your young inventor to tap &ldquo;Show a grown-up&rdquo; again for a fresh code.</p>
        ) : !c.digitalCheckPassed ? (
          <p className="notice bad">This creature can&apos;t be ordered right now.</p>
        ) : (
          <>
            <ol className="wg-next small">
              <li>Your delivery details (adult purchaser only).</li>
              <li>We freeze this exact creature and ask the supplier for a complete quote at the fixed price.</li>
              <li>You accept the quote. Your payment is held, and charged only after the parts are purchased.</li>
            </ol>
            <CheckoutForm designId={id} fixedPriceCents={settings.creaturePriceCents} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <h1>Get a confirmed quote</h1>
      <p>
        <Link href={`/design/${id}`}>{view.name}</Link> &middot; revision {view.revision.rev} &middot; {view.bom.totalPieces} pieces &middot; estimate{" "}
        {formatCents(view.estimate.totalCents)}
      </p>
      {view.validation.status !== "valid" ? (
        <p className="notice bad">This design does not pass the build checks, so it can&apos;t be ordered. Go back and adjust it.</p>
      ) : (
        <>
          <div className="notice sim small">
            We freeze this exact revision and parts list, ask the supplier for a complete quote (parts, picking, packaging, shipping, taxes), then show it to you. Nothing is
            charged until you accept, and you are only charged after the parts are actually purchased.
          </div>
          <CheckoutForm designId={id} />
        </>
      )}
    </div>
  );
}
