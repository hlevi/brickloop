import { notFound } from "next/navigation";
import { getDesignView } from "@/lib/designs";
import { formatCents } from "@/lib/format";
import { getCustomerId } from "@/lib/http";
import { isUuid } from "@/lib/util";
import CheckoutForm from "@/components/CheckoutForm";

/** Interim checkout (replaced in the card-shop build). */
export default async function Checkout(props: { params: Promise<{ designId: string }> }) {
  const { designId } = await props.params;
  const cid = await getCustomerId(false);
  const view = cid && isUuid(designId) ? await getDesignView(cid, designId).catch(() => null) : null;
  if (!view || !view.card) notFound();
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <h1>Send {view.card.title}</h1>
      <p>
        {formatCents(view.priceCents)} including printing, packing, delivery and taxes.
      </p>
      {view.validation.status !== "valid" ? (
        <p className="notice bad">This card does not pass the build checks, so it can&apos;t be ordered.</p>
      ) : (
        <CheckoutForm designId={designId} priceCents={view.priceCents} />
      )}
    </div>
  );
}
