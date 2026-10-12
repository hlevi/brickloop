import type { Metadata } from "next";
import { redirect } from "next/navigation";
import WishCodeForm from "@/components/wish/WishCodeForm";
import { normalizeWishCode } from "@/lib/wishes";

export const metadata: Metadata = { title: "Open a wish - BrickLoop", robots: { index: false } };

/** Grown-ups type the 8-character code from a kid's wish card (with or without the dash). */
export default async function WishEntry(props: { searchParams: Promise<{ code?: string | string[] }> }) {
  const sp = await props.searchParams;
  const raw = Array.isArray(sp.code) ? sp.code[0] : sp.code;
  const code = raw !== undefined ? normalizeWishCode(raw) : null;
  if (code) redirect(`/w/${code}`);
  const error = raw !== undefined ? "That doesn't look like a wish code. It has 8 letters and numbers, like ABCD-2345." : null;
  return (
    <div className="wg-entry">
      <section className="panel stack" style={{ gap: 12 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Have a wish code?</h1>
          <p className="muted" style={{ margin: 0 }}>
            When a young inventor taps &ldquo;Show a grown-up&rdquo; in the Creature Lab, their screen shows a code and a QR code. Scan it, or type the code here.
          </p>
        </div>
        <WishCodeForm initial={raw ?? ""} error={error} />
      </section>
      <p className="small muted">Only grown-ups buy on BrickLoop, and we never ask anything about your child.</p>
    </div>
  );
}
