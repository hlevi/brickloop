import Link from "next/link";
import type { CSSProperties } from "react";
import StartButton from "@/components/StartButton";
import { backdropFor } from "@/lib/creature/worlds";
import { getDesignView, listDesigns } from "@/lib/designs";
import { getCustomerId } from "@/lib/http";
import { renderIso, toSvg } from "@/lib/instructions/iso";
import { isLabKit } from "@/lib/model/templates";
import "@/components/lab/lab.css";
import "./lab-index.css";

const SHELF_MAX = 24;

/** The Lab's front door: invent a new creature or reopen one made on this device. No prices, no text inputs. */
export default async function LabIndex() {
  const cid = await getCustomerId(false);
  const mine = cid ? (await listDesigns(cid)).filter((d) => isLabKit(d.template)).slice(0, SHELF_MAX) : [];
  const shelf = cid
    ? (
        await Promise.all(
          mine.map(async (d) => {
            const v = await getDesignView(cid, d.id).catch(() => null);
            if (!v) return null;
            const art = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(toSvg(renderIso(v.model.parts), { width: 220, padding: 0.6 }))}`;
            return { id: d.id, name: d.name, pieces: d.pieces, art, backdrop: backdropFor(v.params.colors) };
          }),
        )
      ).filter((x) => x !== null)
    : [];
  return (
    <div className="lab-index">
      <section className="lab-index-hero">
        <span className="lab-index-face" aria-hidden>
          🧪
        </span>
        <h1>Creature Lab</h1>
        <StartButton template="creature" to="lab" label="✨ Start inventing" variant="hero" />
      </section>
      {shelf.length > 0 && (
        <section aria-labelledby="my-creatures">
          <h2 id="my-creatures" className="lab-index-title">
            <span aria-hidden>🦖</span> My creatures
          </h2>
          <ul className="lab-index-list">
            {shelf.map((d) => (
              <li key={d.id}>
                <Link href={`/lab/${d.id}`} className="lab-index-item" style={{ "--bd0": d.backdrop[0], "--bd1": d.backdrop[1] } as CSSProperties}>
                  <span className="lab-index-art">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.art} alt="" draggable={false} />
                  </span>
                  <span className="lab-index-name">{d.name}</span>
                  <span className="lab-index-meta">
                    <span aria-hidden>🧱</span> {d.pieces} bricks
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
