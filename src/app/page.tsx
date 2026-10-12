import { renderIso, toSvg } from "@/lib/instructions/iso";
import { buildModel, defaultParams, KITS } from "@/lib/model/templates";
import { computeBom } from "@/lib/bom/bom";
import { estimatePrice } from "@/lib/pricing/estimate";
import { getSettings } from "@/lib/settings";
import { formatCents } from "@/lib/format";
import StartButton from "@/components/StartButton";

const BANDS: { band: string; title: string; blurb: string }[] = [
  { band: "4+", title: "Ages 4+", blurb: "Chunky first builds with big bricks and a few short steps." },
  { band: "6+", title: "Ages 6+", blurb: "Vehicles that roll, with smooth tiles and sloped details." },
  { band: "7+", title: "Ages 7+", blurb: "Brick-built creatures with personality." },
  { band: "8+", title: "Ages 8+", blurb: "Detailed buildings with gardens, doors and real roofs." },
  { band: "9+", title: "Ages 9+", blurb: "Bigger builds with stages, towers and moving parts." },
  { band: "12+", title: "Ages 12+ and adults", blurb: "Calm display pieces for a desk or shelf." },
];

export default async function Gallery() {
  const settings = await getSettings();
  return (
    <div className="stack">
      <section>
        <h1>Build something that&apos;s yours</h1>
        <p className="muted" style={{ maxWidth: 720 }}>
          Pick a kit for your builder&apos;s age, change its colors and options with simple controls or by chatting, and check the exact parts list and step-by-step
          instructions before you buy. You approve a confirmed quote before anything is charged. All kits are original BrickLoop designs.
        </p>
      </section>
      {BANDS.map(({ band, title, blurb }) => {
        const kits = KITS.filter((k) => k.ageBand === band);
        if (!kits.length) return null;
        return (
          <section key={band} aria-label={title} className="stack" style={{ gap: 8 }}>
            <div>
              <h2 style={{ marginBottom: 2 }}>{title}</h2>
              <p className="small muted" style={{ margin: 0 }}>
                {blurb}
              </p>
            </div>
            <div className="grid cards">
              {kits.map((k) => {
                const model = buildModel(defaultParams(k.id));
                const svg = toSvg(renderIso(model.parts), { width: 320 });
                const bom = computeBom(model);
                const est = estimatePrice(bom, settings);
                return (
                  <article key={k.id} className="panel card">
                    <div className="preview" dangerouslySetInnerHTML={{ __html: svg }} aria-label={`${k.name} preview`} role="img" />
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <h3 style={{ margin: 0, fontSize: "1.1rem" }}>{k.name}</h3>
                      <span className="badge info">{k.ageBand}</span>
                    </div>
                    <p className="small muted" style={{ margin: 0 }}>
                      {k.description}
                    </p>
                    <p className="small" style={{ margin: 0 }}>
                      <strong>{bom.totalPieces} pieces</strong> &middot; {model.steps.length} steps &middot; about {formatCents(est.totalCents)} delivered{" "}
                      <span className="muted">(estimate, not a quote)</span>
                    </p>
                    <p className="small muted" style={{ margin: 0 }}>
                      Customize: {k.options.map((o) => o.label.toLowerCase()).concat(["colors"]).join(", ")}
                    </p>
                    <StartButton template={k.id} />
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
      <section className="panel small muted">
        Prices include parts, picking, packaging, shipping, taxes and our service fee. Shipping is a fixed cost per order, so bigger kits are better value per piece. Building
        from a photo isn&apos;t available yet; you can attach a photo to a design as inspiration for our team.
      </section>
    </div>
  );
}
