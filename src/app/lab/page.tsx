import Link from "next/link";
import StartButton from "@/components/StartButton";
import { listDesigns } from "@/lib/designs";
import { getCustomerId } from "@/lib/http";
import { isLabKit } from "@/lib/model/templates";
import "@/components/lab/lab.css";
import "./lab-index.css";

/** The Lab's front door: invent a new creature or reopen one made on this device. */
export default async function LabIndex() {
  const cid = await getCustomerId(false);
  const mine = cid ? (await listDesigns(cid)).filter((d) => isLabKit(d.template)) : [];
  return (
    <div className="lab-index">
      <div className="lab-lost">
        <span className="lab-lost-face" aria-hidden>
          🧪
        </span>
        <h1>Creature Lab</h1>
        <StartButton template="creature" to="lab" label="✨ Start inventing" variant="hero" />
      </div>
      {mine.length > 0 && (
        <section aria-labelledby="my-creatures">
          <h2 id="my-creatures" className="lab-index-title">
            <span aria-hidden>🦖</span> My creatures
          </h2>
          <ul className="lab-index-list">
            {mine.map((d) => (
              <li key={d.id}>
                <Link href={`/lab/${d.id}`} className="lab-index-item">
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
