"use client";

/**
 * CONTRACT (implemented by the wish feature): full-screen "Show a grown-up" card.
 * Props are fixed: the Lab renders <WishCard designId={id} onClose={...} />.
 * It creates a wish for the design's current revision (POST /api/designs/[id]/wish),
 * shows the creature, its name, an 8-character code, a QR code to /w/CODE, a note
 * sticker choice and a calm status line that polls GET /api/wishes/[code]/status.
 * It must never show money, ask for personal data or contain free-text inputs.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { backdropFor } from "@/lib/creature/worlds";
import { renderIso, toSvg } from "@/lib/instructions/iso";
import type { KidStage, KidStatus, KidWish } from "@/lib/wishes";
import { NOTE_STICKERS, noteSticker, type NoteId } from "@/components/wish/notes";
import "@/components/wish/wish-card.css";

export interface WishCardProps {
  designId: string;
  onClose: () => void;
}

const POLL_MS = 10_000;

/** Calm, forward-only words for the kid. Problems only ever read "Taking a little longer". */
export const STAGE_TEXT: Record<KidStage, { icon: string; text: string }> = {
  waiting: { icon: "⏳", text: "Waiting for a grown-up" },
  seen: { icon: "👀", text: "A grown-up is looking" },
  ordered: { icon: "🎉", text: "Ordered!" },
  gathering: { icon: "🧺", text: "Gathering your bricks" },
  packing: { icon: "📦", text: "Packing" },
  on_the_way: { icon: "🚚", text: "On its way" },
  arrived: { icon: "🏠", text: "It's here!" },
};

export default function WishCard({ designId, onClose }: WishCardProps) {
  const [wish, setWish] = useState<KidWish | null>(null);
  const [note, setNote] = useState<NoteId | null>(null);
  const [status, setStatus] = useState<KidStatus>({ stage: "waiting", slow: false });
  const [failed, setFailed] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const noteChain = useRef<Promise<unknown>>(Promise.resolve());

  /** Without a note: open the wish for the creature on screen, keeping the sticker picked before. */
  const makeWish = useCallback(
    async (n?: NoteId) => {
      const r = await fetch(`/api/designs/${designId}/wish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(n ? { note: n } : {}) });
      if (!r.ok) throw new Error(String(r.status));
      const w = (await r.json()) as KidWish;
      setWish(w);
      setStatus(w.status);
      return w;
    },
    [designId],
  );

  const start = useCallback(() => {
    setFailed(false);
    // Sticker taps made while the card is opening wait for it (same promise chain).
    noteChain.current = noteChain.current.then(() =>
      makeWish()
        .then((w) => setNote((picked) => picked ?? w.note))
        .catch(() => setFailed(true)),
    );
  }, [makeWish]);

  // Create (or reuse) the wish when the card opens.
  useEffect(() => {
    start();
  }, [start]);

  // Full-screen: lock page scroll, focus the close button, close on Escape.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    setOrigin(window.location.origin);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const code = wish?.code ?? null;
  const url = code && origin ? `${origin}/w/${code.replace("-", "")}` : null;

  // QR code (SVG, generated on this device; no network).
  useEffect(() => {
    if (!url) return;
    let alive = true;
    import("qrcode")
      .then((m) => m.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1d1d1f", light: "#ffffff" } }))
      .then((svg) => alive && setQr(svg))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [url]);

  // Calm status line: poll every 10 s, only while the page is visible.
  useEffect(() => {
    if (!code) return;
    let alive = true;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/wishes/${code}/status`, { cache: "no-store" });
        if (!r.ok) return;
        const s = (await r.json()) as KidStatus;
        if (alive && s && typeof s.stage === "string" && s.stage in STAGE_TEXT) setStatus({ stage: s.stage, slow: !!s.slow });
      } catch {
        // Offline for a moment: keep showing the last calm status.
      }
    };
    const t = setInterval(poll, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [code]);

  const pickNote = (n: NoteId) => {
    if (n === note) return;
    setNote(n);
    // Same revision, same code: the server only swaps the sticker. Serialize taps.
    noteChain.current = noteChain.current.then(() =>
      makeWish(n)
        .then((w) => {
          // A grown-up ordered meanwhile: show the sticker they saw.
          if (w.note !== n) setNote(w.note);
        })
        .catch(() => undefined),
    );
  };

  const art = useMemo(() => (wish ? toSvg(renderIso(wish.parts), { width: 360 }) : ""), [wish]);
  const [bgA, bgB] = backdropFor(wish?.colors ?? {});
  const st = STAGE_TEXT[status.stage];
  const ordered = status.stage !== "waiting" && status.stage !== "seen";

  return (
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="wk-title" className="wk" style={{ background: `linear-gradient(160deg, ${bgA}, ${bgB})` }}>
      <div className="wk-inner">
        <div className="wk-top">
          <button className="wk-close" onClick={onClose}>
            <span aria-hidden>⬅️</span> Back to my creature
          </button>
        </div>

        <div className="wk-main">
          <h1 id="wk-title" className="wk-title">
            Show a grown-up!
          </h1>

          <div className="wk-body">
            <section className="wk-creature" aria-label="Your creature">
              <div className="wk-art" role="img" aria-label={wish ? `Picture of ${wish.name}` : "Your creature"} dangerouslySetInnerHTML={{ __html: art }} />
              <p className="wk-name">{wish?.name ?? " "}</p>
              {wish && (
                <p className="wk-by">
                  Invented by <strong>{wish.builder}</strong>
                </p>
              )}
            </section>

            <section className="wk-wish" aria-label="Wish code">
              {failed ? (
                <div className="wk-code-box wk-retry">
                  <p className="wk-hint">Let&apos;s try that again.</p>
                  <button className="wk-big-btn" onClick={start}>
                    <span aria-hidden>🔁</span> Try again
                  </button>
                </div>
              ) : (
                <div className="wk-code-box">
                  <div className="wk-qr" aria-hidden={!qr}>
                    {qr ? (
                      <div className="wk-qr-svg" role="img" aria-label="QR code for a grown-up to scan" dangerouslySetInnerHTML={{ __html: qr }} />
                    ) : (
                      <div className="wk-qr-empty" />
                    )}
                  </div>
                  <div className="wk-code-side">
                    <p className="wk-hint">
                      {ordered ? (
                        "Your wish code"
                      ) : (
                        <>
                          <span aria-hidden>📱</span> A grown-up can scan this
                        </>
                      )}
                    </p>
                    <p className="wk-code" aria-label={code ? `Wish code ${code.split("").join(" ")}` : "Making your wish code"}>
                      {code ?? "····-····"}
                    </p>
                    {url && <p className="wk-url">or type the code at {origin.replace(/^https?:\/\//, "")}/w</p>}
                  </div>
                </div>
              )}

              <div className="wk-status" role="status" aria-live="polite">
                <span className="wk-status-icon" aria-hidden>
                  {st.icon}
                </span>
                <span>
                  {st.text}
                  {status.slow && <span className="wk-slow"> · Taking a little longer</span>}
                </span>
              </div>
            </section>
          </div>

          {ordered ? (
            // Once the bricks are ordered, the sticker the grown-up saw stays put.
            note && (
              <section className="wk-notes" aria-label="Your sticker">
                <p className="wk-notes-title">Your sticker</p>
                <div className="wk-note-row">
                  <span className="wk-note is-kept">
                    <span className="wk-note-icon" aria-hidden>
                      {noteSticker(note).icon}
                    </span>
                    <span>{noteSticker(note).label}</span>
                  </span>
                </div>
              </section>
            )
          ) : (
            <section className="wk-notes" aria-label="Add a sticker">
              <p className="wk-notes-title">Add a sticker</p>
              <div className="wk-note-row">
                {NOTE_STICKERS.map((n) => (
                  <button key={n.id} className="wk-note" aria-pressed={note === n.id} onClick={() => pickNote(n.id)}>
                    <span className="wk-note-icon" aria-hidden>
                      {n.icon}
                    </span>
                    <span>{n.label}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
