import Link from "next/link";
import { notFound } from "next/navigation";
import { getDesignView } from "@/lib/designs";
import { formatCents } from "@/lib/format";
import { getCustomerId } from "@/lib/http";
import { renderIso, toSvg } from "@/lib/instructions/iso";
import { isUuid } from "@/lib/util";

/** Interim saved-card page (replaced in the card-shop build). */
export default async function SavedCard(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const cid = await getCustomerId(false);
  const view = cid && isUuid(id) ? await getDesignView(cid, id).catch(() => null) : null;
  if (!view) notFound();
  const svg = toSvg(renderIso(view.model.parts), { width: 360 });
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <h1>{view.card?.title ?? view.name}</h1>
      {view.card && <p className="muted">Cover: &ldquo;{view.card.headline}&rdquo;</p>}
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      <p>
        {view.bom.totalPieces} pieces &middot; {formatCents(view.priceCents)}
      </p>
      <p>
        <Link className="btn primary" href={`/checkout/${id}`}>
          Continue to checkout
        </Link>
      </p>
    </div>
  );
}
