import Link from "next/link";
import { getDesignView } from "@/lib/designs";
import { getCustomerId } from "@/lib/http";
import { formatCents } from "@/lib/format";
import CheckoutForm from "@/components/CheckoutForm";

export default async function Checkout(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const cid = await getCustomerId(false);
  const view = cid ? await getDesignView(cid, id).catch(() => null) : null;
  if (!view) return <p className="error">Design not found.</p>;
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <h1>Get a confirmed quote</h1>
      <p>
        <Link href={`/design/${id}`}>{view.name}</Link> &middot; revision {view.revision.rev} &middot; {view.bom.totalPieces} pieces &middot; estimate {formatCents(view.estimate.totalCents)}
      </p>
      {view.validation.status !== "valid" ? (
        <p className="notice bad">This design does not pass the build checks, so it can&apos;t be ordered. Go back and adjust it.</p>
      ) : (
        <>
          <div className="notice sim small">
            We freeze this exact revision and parts list, ask the supplier for a complete quote (parts, picking, packaging, shipping, taxes), then show it to you.
            Nothing is charged until you accept, and you are only charged after the parts are actually purchased.
          </div>
          <CheckoutForm designId={id} />
        </>
      )}
    </div>
  );
}
