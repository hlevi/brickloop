import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import GrownupWish from "@/components/wish/GrownupWish";
import { assertRateLimit } from "@/lib/http";
import { formatWishCode, normalizeWishCode, wishIsActive } from "@/lib/wishes";

export const metadata: Metadata = { title: "A creature wish - BrickLoop", robots: { index: false } };

/**
 * Grown-up page for a wish. The server only checks that the code is active (read-only,
 * rate limited); the creature, price and order button load after the neutral age
 * screen, which itself writes nothing.
 */
export default async function WishPage(props: { params: Promise<{ code: string }> }) {
  const { code: raw } = await props.params;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // keep the raw value; normalizing rejects it anyway
  }
  const code = normalizeWishCode(decoded);
  if (!code) notFound();
  try {
    assertRateLimit(await headers(), "wish-lookup", 30);
  } catch {
    return (
      <section className="panel wg-gate">
        <h1>Too many tries</h1>
        <p className="muted">Please wait a minute, then open the wish again.</p>
      </section>
    );
  }
  if (!(await wishIsActive(code))) notFound();
  return <GrownupWish code={formatWishCode(code)} />;
}
