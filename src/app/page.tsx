import { renderIso, toSvg } from "@/lib/instructions/iso";
import { buildModel, defaultParams, TEMPLATES } from "@/lib/model/templates";
import { computeBom } from "@/lib/bom/bom";
import { estimatePrice } from "@/lib/pricing/estimate";
import { formatCents } from "@/lib/format";
import StartButton from "@/components/StartButton";

export default function Gallery() {
  return (
    <div className="stack">
      <section>
        <h1>Build something that&apos;s yours</h1>
        <p className="muted" style={{ maxWidth: 680 }}>
          Pick a starter model, change its colors and size with simple controls or by chatting, and check the exact parts list and step-by-step instructions before
          you buy. You approve a confirmed quote before anything is charged.
        </p>
      </section>
      <section className="grid cards" aria-label="Starter models">
        {TEMPLATES.map((t) => {
          const model = buildModel(defaultParams(t.id));
          const svg = toSvg(renderIso(model.parts), { width: 320 });
          const bom = computeBom(model);
          const est = estimatePrice(bom);
          return (
            <article key={t.id} className="panel card">
              <div className="preview" dangerouslySetInnerHTML={{ __html: svg }} aria-label={`${t.name} preview`} role="img" />
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h2 style={{ margin: 0 }}>{t.name}</h2>
                {t.maturity === "primary" ? <span className="badge ok">Pilot model</span> : <span className="badge info">Preview</span>}
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                {t.description}
              </p>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {t.adjustable.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
              <p className="small" style={{ margin: 0 }}>
                {bom.totalPieces} pieces &middot; estimate from {formatCents(est.totalCents)} <span className="muted">(not a quote)</span>
              </p>
              <StartButton template={t.id} />
            </article>
          );
        })}
      </section>
      <section className="panel small muted">
        Community designs and building from photos are not available in this pilot. You can attach a photo to a design as inspiration for our team to review; it is not
        turned into a model automatically.
      </section>
    </div>
  );
}
