import Link from "next/link";
import { listedCards } from "@/lib/cards/catalog";
import { OCCASIONS } from "@/lib/cards/occasions";

/** Interim home page (replaced by the shop home in the card-shop build). */
export default function Home() {
  const cards = listedCards();
  return (
    <div className="stack">
      <h1>Greeting cards they build</h1>
      <p className="muted">Every card comes with the bricks to build a keepsake. Pick a card, personalize it, and we order the parts, print the card and send it.</p>
      <p>
        <Link href="/create">Create your own mosaic card</Link>
      </p>
      {OCCASIONS.map((o) => {
        const list = cards.filter((c) => c.occasions.includes(o.id));
        if (!list.length) return null;
        return (
          <section key={o.id}>
            <h2>{o.label}</h2>
            <ul>
              {list.map((c) => (
                <li key={c.id}>
                  <Link href={`/cards/${c.id}`}>{c.title}</Link> <span className="muted small">{c.tagline}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
