"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COLORS } from "@/lib/catalog/colors";
import { renderIso, toSvg } from "@/lib/instructions/iso";
import { COLOR_OPTIONS } from "@/lib/edit/tools";
import type { DesignView } from "@/lib/designs";
import type { StepSummary } from "@/lib/instructions/steps";
import { formatCents } from "@/lib/format";

const BrickViewer = dynamic(() => import("./BrickViewer"), { ssr: false, loading: () => <div className="viewer" /> });

type View = DesignView & { steps: StepSummary[]; uploads: { id: string; original_name: string; review_status: string }[] };
type Msg = { role: string; content: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message ?? `Request failed (${r.status})`);
  return j as T;
}
const post = (url: string, body?: unknown) => api(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });

export default function Editor({ designId }: { designId: string }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await api<View>(`/api/designs/${designId}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [designId]);
  useEffect(() => {
    load();
  }, [load]);

  const edit = async (calls: { name: string; input: Record<string, unknown> }[]) => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await post(`/api/designs/${designId}/edit`, { calls }) as { applied: string[]; rejected: string[] };
      if (r.rejected.length) setNotice(r.rejected.join(" "));
      await load();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const control = async (what: "undo" | "reset") => {
    setBusy(true);
    try {
      await post(`/api/designs/${designId}/${what}`);
      await load();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="error">{error === "Not found" ? "Design not found." : error}</p>;
  if (!view) return <p className="muted">Loading design...</p>;
  const p = view.params;

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{view.name}</h1>
          <span className="small muted">
            Revision {view.revision.rev} &middot; {view.revision.note ?? view.revision.source}
          </span>
        </div>
        <div className="row">
          <button className="btn" onClick={() => control("undo")} disabled={busy || !view.revision.canUndo}>
            Undo
          </button>
          <button className="btn" onClick={() => control("reset")} disabled={busy}>
            Reset
          </button>
          <Link className={`btn primary`} href={`/design/${designId}/checkout`} aria-disabled={view.validation.status !== "valid"}>
            Get a quote
          </Link>
        </div>
      </div>
      {notice && <div className="notice">{notice}</div>}

      <div className="editor editor-areas">
        <div className="viewer area-a">
          <BrickViewer parts={view.model.parts} />
          <span className="viewer-hint">Drag to rotate, scroll or pinch to zoom</span>
        </div>
        <div className="stack area-c">
          <StepViewer view={view} />
          <PartsList view={view} designId={designId} />
        </div>

        <div className="stack area-b">
          <section className="panel">
            <h2>Customize</h2>
            {p.template === "house" && (
              <>
                <Seg label="Width (studs)" options={[6, 8, 10]} value={p.width} onChange={(v) => edit([{ name: "set_house_width", input: { width: v } }])} disabled={busy} />
                <Seg label="Roof" options={["gable", "flat"]} value={p.roofStyle} onChange={(v) => edit([{ name: "set_roof_style", input: { style: v } }])} disabled={busy} />
              </>
            )}
            {p.template === "firetruck" && (
              <Seg label="Ladder length (studs)" options={[6, 8, 10]} value={p.ladderLength} onChange={(v) => edit([{ name: "set_ladder_length", input: { length: v } }])} disabled={busy} />
            )}
            {p.template === "creature" && (
              <Seg label="Body segments" options={[2, 3, 4, 5]} value={p.bodyLength} onChange={(v) => edit([{ name: "set_creature_length", input: { segments: v } }])} disabled={busy} />
            )}
            {Object.entries(COLOR_OPTIONS[p.template]).map(([comp, colors]) => (
              <div className="field" key={comp}>
                <span className="label">
                  {comp[0].toUpperCase() + comp.slice(1)}: <span className="muted">{COLORS[(p.colors as Record<string, string>)[comp]]?.name}</span>
                </span>
                <div className="swatches" role="group" aria-label={`${comp} color`}>
                  {colors.map((c) => (
                    <button
                      key={c}
                      className="swatch"
                      title={COLORS[c].name}
                      aria-label={COLORS[c].name}
                      aria-pressed={(p.colors as Record<string, string>)[comp] === c}
                      style={{ background: COLORS[c].hex, opacity: COLORS[c].transparent ? 0.7 : 1 }}
                      disabled={busy}
                      onClick={() => edit([{ name: "set_color", input: { component: comp, color: c } }])}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>

          <Chat designId={designId} onChanged={load} />
          <Validation view={view} />
          <Estimate view={view} designId={designId} onApply={edit} />
          <Uploads designId={designId} uploads={view.uploads} onChanged={load} />
        </div>
      </div>
    </div>
  );
}

function Seg<T extends string | number>({ label, options, value, onChange, disabled }: { label: string; options: T[]; value: T; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={String(o)} aria-pressed={o === value} onClick={() => o !== value && onChange(o)} disabled={disabled}>
            {String(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepViewer({ view }: { view: View }) {
  const [step, setStep] = useState(1);
  const total = view.steps.length;
  const s = Math.min(step, total);
  const svg = useMemo(() => toSvg(renderIso(view.model.parts, { uptoStep: s, highlightStep: s, showFrontCue: true }), { width: 520 }), [view.model.parts, s]);
  const info = view.steps[s - 1];
  return (
    <section className="panel steps" aria-label="Building steps">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>
          Step {s} of {total}: {info?.title}
        </h2>
        <div className="row">
          <button className="btn small" onClick={() => setStep(Math.max(1, s - 1))} disabled={s <= 1}>
            Previous
          </button>
          <button className="btn small" onClick={() => setStep(Math.min(total, s + 1))} disabled={s >= total}>
            Next
          </button>
        </div>
      </div>
      {info?.note && <p className="small muted" style={{ margin: 0 }}>{info.note}</p>}
      <div className="preview" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="small" style={{ margin: 0 }}>
        Parts this step:{" "}
        {info?.parts.map((pp) => `${pp.quantity}x ${pp.partId.replace(/-/g, " ")} (${COLORS[pp.colorId]?.name})`).join(", ")}
      </p>
    </section>
  );
}

function PartsList({ view, designId }: { view: View; designId: string }) {
  return (
    <section className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Parts list ({view.bom.totalPieces} pieces)</h2>
        <div className="row">
          <a className="btn small" href={`/api/designs/${designId}/instructions`} target="_blank" rel="noreferrer">
            Instructions PDF
          </a>
          <a className="btn small" href={`/api/designs/${designId}/bom?format=csv`}>
            CSV
          </a>
          <a className="btn small" href={`/api/designs/${designId}/bom?format=xml&allowProvisional=1`} title="Identifiers are provisional; the file includes a warning">
            BrickLink XML
          </a>
        </div>
      </div>
      {!view.bom.liveSourcingReady && (
        <p className="small notice" style={{ marginTop: 8 }}>
          {view.bom.unresolved.length} of {view.bom.lines.length} part/color identifiers are provisional (not yet verified against a supplier catalog). Live sourcing stays
          blocked until they are verified.
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Part</th>
              <th>Color</th>
              <th className="num">Qty</th>
              <th>BrickLink id</th>
              <th>Mapping</th>
            </tr>
          </thead>
          <tbody>
            {view.bom.lines.map((l) => (
              <tr key={`${l.partId}|${l.colorId}`}>
                <td>{l.partName}</td>
                <td>
                  <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: COLORS[l.colorId]?.hex, border: "1px solid #0003", marginRight: 6 }} />
                  {l.colorName}
                </td>
                <td className="num">{l.quantity}</td>
                <td className="mono">
                  {l.mapping.externalItemId ?? "-"} / {l.mapping.externalColorId ?? "-"}
                </td>
                <td>
                  <span className={`badge ${l.mapping.status === "verified" ? "ok" : l.mapping.status === "provisional" ? "warn" : "bad"}`}>{l.mapping.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Validation({ view }: { view: View }) {
  const v = view.validation;
  return (
    <section className="panel">
      <h2>Build checks</h2>
      <div className="row">
        <span className={`badge ${v.status === "valid" ? "ok" : "bad"}`}>Digital: {v.status}</span>
        <span className={`badge ${v.physicallyValidated ? "ok" : "warn"}`}>Physical test build: {v.physicallyValidated ? "done" : "not yet"}</span>
      </div>
      {v.errors.length > 0 && (
        <ul className="small error">
          {v.errors.map((e, i) => (
            <li key={i}>{e.message}</li>
          ))}
        </ul>
      )}
      {v.warnings.length > 0 && (
        <details className="small" style={{ marginTop: 8 }}>
          <summary>{v.warnings.length} note(s)</summary>
          <ul>
            {v.warnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="small muted" style={{ marginBottom: 0 }}>
        {v.scope}
      </p>
    </section>
  );
}

function Estimate({ view, designId, onApply }: { view: View; designId: string; onApply: (calls: { name: string; input: Record<string, unknown> }[]) => Promise<void> }) {
  const e = view.estimate;
  const [budget, setBudget] = useState("");
  const [sugg, setSugg] = useState<{ withinBudget: boolean; suggestions: { label: string; estimateCents: number; calls: { name: string; input: Record<string, unknown> }[] }[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const check = async () => {
    setErr(null);
    const cents = Math.round(Number(budget) * 100);
    if (!cents || cents <= 0) return setErr("Enter a budget in dollars");
    try {
      setSugg(await api(`/api/designs/${designId}/budget?cents=${cents}`));
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  return (
    <section className="panel">
      <h2>Estimated price</h2>
      <table className="price-table">
        <tbody>
          <tr>
            <td>Parts</td>
            <td>{formatCents(e.partsCents)}</td>
          </tr>
          <tr>
            <td>Picking &amp; processing (supplier)</td>
            <td>{formatCents(e.pickingCents)}</td>
          </tr>
          <tr>
            <td>Packaging</td>
            <td>{formatCents(e.packagingCents)}</td>
          </tr>
          <tr>
            <td>Shipping</td>
            <td>{formatCents(e.shippingCents)}</td>
          </tr>
          <tr>
            <td>Taxes (estimated)</td>
            <td>{formatCents(e.taxCents)}</td>
          </tr>
          <tr>
            <td>BrickLoop service fee</td>
            <td>{formatCents(e.serviceFeeCents)}</td>
          </tr>
          <tr className="total">
            <td>Estimated total</td>
            <td>{formatCents(e.totalCents)}</td>
          </tr>
        </tbody>
      </table>
      <p className="small muted">{e.basis} New parts: no cleaning charges apply.</p>
      <div className="field">
        <label htmlFor="budget">Your budget (USD)</label>
        <div className="row">
          <input id="budget" type="number" min="1" step="1" inputMode="decimal" value={budget} onChange={(x) => setBudget(x.target.value)} style={{ maxWidth: 140 }} />
          <button className="btn small" onClick={check}>
            Check
          </button>
        </div>
        {err && <span className="error small">{err}</span>}
      </div>
      {sugg &&
        (sugg.withinBudget ? (
          <p className="small notice ok">This design&apos;s estimate fits your budget.</p>
        ) : sugg.suggestions.length ? (
          <div className="small">
            <p style={{ margin: "0 0 6px" }}>Over budget. Supported changes that fit:</p>
            {sugg.suggestions.map((s) => (
              <div className="row" key={s.label} style={{ marginBottom: 4 }}>
                <span>
                  {s.label}: {formatCents(s.estimateCents)}
                </span>
                <button className="btn small" onClick={() => onApply(s.calls).then(() => setSugg(null))}>
                  Apply
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="small notice">No supported variation of this model fits that budget.</p>
        ))}
    </section>
  );
}

function Chat({ designId, onChanged }: { designId: string; onChanged: () => Promise<void> }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<string>("");
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    api<{ messages: (Msg & { mode: string })[] }>(`/api/designs/${designId}/chat`).then((r) => setMessages(r.messages)).catch(() => {});
    api<{ chatMode: string }>(`/api/status`).then((s) => setMode(s.chatMode)).catch(() => {});
  }, [designId]);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);
  const send = async () => {
    const m = text.trim();
    if (!m) return;
    setBusy(true);
    setText("");
    setMessages((x) => [...x, { role: "user", content: m }]);
    try {
      const r = await post(`/api/designs/${designId}/chat`, { message: m }) as { reply: string };
      setMessages((x) => [...x, { role: "assistant", content: r.reply }]);
      await onChanged();
    } catch (e) {
      setMessages((x) => [...x, { role: "assistant", content: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel chat">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Describe a change</h2>
        {mode && <span className={`badge ${mode === "llm" ? "info" : "sim"}`}>{mode === "llm" ? "AI assistant" : "Offline assistant (no AI key)"}</span>}
      </div>
      <div className="chat-log" ref={logRef} aria-live="polite">
        {messages.length === 0 && <p className="small muted">Try: &quot;make the roof blue and the walls yellow&quot;, &quot;wider&quot;, &quot;flat roof&quot;, or &quot;undo&quot;.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.content}
          </div>
        ))}
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell us what to change" aria-label="Message" maxLength={1000} style={{ flex: 1 }} />
        <button className="btn" disabled={busy || !text.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}

function Uploads({ designId, uploads, onChanged }: { designId: string; uploads: View["uploads"]; onChanged: () => Promise<void> }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel">
      <h2>Inspiration photo</h2>
      <p className="small muted">
        Optional. Attach a photo (PNG, JPEG or WebP, up to 5 MB) for our team to review. Photos are not turned into models automatically. Please don&apos;t upload photos
        of people.
      </p>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={busy}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setErr(null);
          setBusy(true);
          const fd = new FormData();
          fd.append("file", f);
          const r = await fetch(`/api/designs/${designId}/uploads`, { method: "POST", body: fd });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) setErr(j.message ?? "Upload failed");
          e.target.value = "";
          setBusy(false);
          await onChanged();
        }}
      />
      {err && <p className="error small">{err}</p>}
      {uploads.length > 0 && (
        <ul className="small">
          {uploads.map((u) => (
            <li key={u.id}>
              <a href={`/api/uploads/${u.id}`} target="_blank" rel="noreferrer">
                {u.original_name}
              </a>{" "}
              <span className="badge warn">{u.review_status.replace(/_/g, " ")}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
