import Link from "next/link";
import { notFound } from "next/navigation";
import { getDesignView } from "@/lib/designs";
import { renderBuilder } from "@/lib/creature/words";
import { getCustomerId } from "@/lib/http";
import { formatCents } from "@/lib/format";
import { renderIso, toSvg } from "@/lib/instructions/iso";
import { liveReadiness } from "@/lib/orders/live";
import { getSettings } from "@/lib/settings";
import { wishForClaimedDesign } from "@/lib/wishes";
import CheckoutForm from "@/components/CheckoutForm";

export default async function Checkout(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const cid = await getCustomerId(false);
  const view = cid ? await getDesignView(cid, id).catch(() => null) : null;
  if (!view) return <p className="error">Design not found.</p>;

  if (view.lab) {
    // Creature Lab designs reach checkout only as a grown-up's copy made by claiming a wish.
    const wish = await wishForClaimedDesign(id);
    if (!wish) notFound();
    const [settings, readiness] = await Promise.all([getSettings(), liveReadiness()]);
    const openOrder = wish.orderId && wish.orderStatus && !["canceled", "refunded"].includes(wish.orderStatus) ? wish : null;
    const svg = toSvg(renderIso(view.model.parts), { width: 220 });
    return (
      <div className="stack" style={{ maxWidth: 720 }}>
        <h1 style={{ marginBottom: 0 }}>Order {view.name}</h1>
        <section className="panel row" style={{ gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div
            className="preview"
            style={{ background: "linear-gradient(180deg,#fbfaf7,#efede6)", borderRadius: 10, padding: 6, display: "flex" }}
            role="img"
            aria-label={`${view.name} in real bricks`}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <div className="stack" style={{ gap: 4, flex: "1 1 220px" }}>
            <p style={{ margin: 0 }}>
              Invented by <strong>{renderBuilder(view.params.identity)}</strong> &middot; {view.bom.totalPieces} pieces &middot; {view.model.steps.length} steps
            </p>
            <p style={{ margin: 0, fontSize: "1.8rem", fontWeight: 900, lineHeight: 1.1 }}>{formatCents(settings.creaturePriceCents)}</p>
            <p style={{ margin: 0, fontWeight: 700 }}>Fixed price, includes delivery and taxes</p>
            {!readiness.ready && (
              <p className="small" style={{ margin: 0 }}>
                <span className="badge sim">SIMULATION</span> Orders are simulated: no money moves and nothing ships.
              </p>
            )}
          </div>
        </section>
        {openOrder ? (
          <p className="notice ok">
            These bricks are already ordered.{" "}
            {openOrder.orderCustomerId === cid ? (
              <Link href={`/orders/${openOrder.orderId}`}>Follow the order</Link>
            ) : (
              "The grown-up who ordered them can follow it under My orders."
            )}
          </p>
        ) : view.validation.status !== "valid" ? (
          <p className="notice bad">This creature can&apos;t be ordered right now.</p>
        ) : (
          <>
            <div className="notice sim small">
              We freeze this exact creature and its parts list, ask the supplier for a complete quote, and show it to you at the fixed price. Nothing is charged until you accept,
              and you are only charged after the parts are actually purchased.
            </div>
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
