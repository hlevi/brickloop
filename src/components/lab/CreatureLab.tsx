"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { applyTool, type ToolCall } from "@/lib/edit/tools";
import { EditQueue, type EditResult } from "@/lib/creature/editQueue";
import { labModel, labTabs } from "@/lib/creature/lab";
import { shuffleCalls } from "@/lib/creature/shuffle";
import { isMuted, onMutedChange, play, toggleMuted, type SoundName } from "@/lib/creature/sound";
import { creatureStats, type CreatureStats } from "@/lib/creature/stats";
import { renderBuilder, renderName } from "@/lib/creature/words";
import { backdropFor } from "@/lib/creature/worlds";
import { getKit } from "@/lib/model/templates";
import type { DesignParams, PlacedPart } from "@/lib/model/types";
import CreatureCard from "./CreatureCard";
import Confetti from "./Confetti";
import { ColorsPanel, NamePanel, PowerPanel, SlotPanel, TabBar, type Act } from "./LabPanels";
import ViewerBoundary, { IsoCreature } from "./ViewerBoundary";
import WishCard from "./WishCard";
import "./lab.css";

const BrickViewer = dynamic(() => import("../BrickViewer"), {
  ssr: false,
  loading: () => (
    <div className="lab-stage-loading" aria-hidden>
      🥚
    </div>
  ),
});

export interface LabInitial {
  params: DesignParams;
  rev: number;
  canUndo: boolean;
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return j as T;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    try {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      const sync = () => setReduced(mq.matches);
      sync();
      mq.addEventListener?.("change", sync);
      return () => mq.removeEventListener?.("change", sync);
    } catch {
      return undefined;
    }
  }, []);
  return reduced;
}

/**
 * The kid-facing Creature Lab: a toy screen. Every tap is applied locally first
 * (applyTool + a client-side compile) so the creature reacts at once; the same
 * tool calls are then saved in order by an EditQueue. There is no free text, no
 * price, no validation text and no error state anywhere on this screen.
 */
export default function CreatureLab({ designId, initial, isNew = false, initialTab }: { designId: string; initial: LabInitial; isNew?: boolean; initialTab?: string }) {
  const router = useRouter();
  const kit = getKit(initial.params.template);
  const tabs = useMemo(() => labTabs(kit), [kit]);
  const reducedMotion = usePrefersReducedMotion();

  const [params, setParams] = useState<DesignParams>(initial.params);
  const paramsRef = useRef(params);
  const [hatching, setHatching] = useState(isNew && initial.rev === 1);
  const [server, setServer] = useState({ rev: initial.rev, canUndo: initial.canUndo });
  const [undoable, setUndoable] = useState(0);
  const [tab, setTab] = useState(initialTab && tabs.some((t) => t.id === initialTab) ? initialTab : tabs[0].id);
  const [locks, setLocks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [assembleKey, setAssembleKey] = useState(0);
  const [assembling, setAssembling] = useState(false);
  const assemblingRef = useRef(false);
  const [celebrate, setCelebrate] = useState(0);
  const [prevStats, setPrevStats] = useState<CreatureStats | null>(null);
  const [pulse, setPulse] = useState(0);
  const [lever, setLever] = useState(0);
  const [wish, setWish] = useState<"closed" | "opening" | "open">("closed");
  const [muted, setMuted] = useState(false);
  const [starting, setStarting] = useState(false);

  const model = useMemo(() => labModel(params), [params]);
  const stats = useMemo(() => creatureStats(model), [model]);
  const backdrop = backdropFor(params.colors);
  const name = renderName(params.identity);
  const builder = renderBuilder(params.identity);

  const reload = useCallback(async () => {
    try {
      const r = await fetch(`/api/designs/${designId}`);
      if (!r.ok) return;
      const v = (await r.json()) as { params: DesignParams; revision: { rev: number; canUndo: boolean } };
      setPrevStats(creatureStats(labModel(paramsRef.current)));
      setPulse((n) => n + 1);
      paramsRef.current = v.params;
      setParams(v.params);
      setServer({ rev: v.revision.rev, canUndo: v.revision.canUndo });
    } catch {
      // Stay calm: keep showing the creature we have.
    }
  }, [designId]);
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  const [queue] = useState(() => {
    const q: EditQueue = new EditQueue({
      send: (calls) => postJson<EditResult>(`/api/designs/${designId}/edit`, { calls }),
      undo: async () => {
        await postJson(`/api/designs/${designId}/undo`);
      },
      onDesync: () => {
        q.reset();
        void reloadRef.current();
      },
      onChange: () => setUndoable(q.undoable),
    });
    return q;
  });

  const act: Act = useCallback(
    (calls: ToolCall[], opts: { coalesce?: string; sound?: SoundName; pitch?: number; record?: boolean } = {}) => {
      if (busyRef.current || assemblingRef.current) return false;
      let next = paramsRef.current;
      const ok: ToolCall[] = [];
      for (const c of calls) {
        const r = applyTool(next, c);
        if (r.ok) {
          next = r.params;
          ok.push(c);
        }
      }
      if (!ok.length) return false;
      setPrevStats(creatureStats(labModel(paramsRef.current)));
      setPulse((n) => n + 1);
      paramsRef.current = next;
      setParams(next);
      queue.push(ok, { coalesce: opts.coalesce, record: opts.record });
      if (opts.sound) play(opts.sound, opts.pitch);
      return true;
    },
    [queue],
  );

  // A brand-new design: one starter shuffle (shape, world and name), so the Lab never opens on a blank canvas.
  const started = useRef(false);
  useEffect(() => {
    if (!isNew || started.current) return;
    started.current = true;
    if (initial.rev === 1) {
      const calls = shuffleCalls(kit, paramsRef.current, [], Math.random, { identity: true });
      act(calls, { record: false });
      setPrevStats(null);
    }
    setHatching(false);
    router.replace(`/lab/${designId}`, { scroll: false });
  }, [isNew, initial.rev, kit, act, router, designId]);

  useEffect(() => {
    setMuted(isMuted());
    return onMutedChange(setMuted);
  }, []);

  // Safety net: never leave the controls disabled if the 3D stage cannot report the end of a reveal.
  useEffect(() => {
    if (!assembling) return;
    const t = window.setTimeout(() => {
      if (assemblingRef.current) {
        assemblingRef.current = false;
        setAssembling(false);
      }
    }, 6000);
    return () => window.clearTimeout(t);
  }, [assembling, assembleKey]);

  const canUndo = undoable > 0 || (server.canUndo && server.rev > 2);
  const locked = (id: string) => locks.includes(id);
  const toggleLock = (id: string) => {
    play("tick", locked(id) ? 0.8 : 1.2);
    setLocks((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  };

  const undo = async () => {
    if (busyRef.current || assemblingRef.current || !canUndo) return;
    busyRef.current = true;
    setBusy(true);
    play("whoosh");
    try {
      const did = await queue.undo(server.canUndo && server.rev > 2 ? 1 : 0);
      if (did) await reload();
    } catch {
      await reload();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const shuffle = () => {
    if (busyRef.current || assemblingRef.current) return;
    setLever((n) => n + 1);
    const calls = shuffleCalls(kit, paramsRef.current, locks);
    if (!calls.length) {
      play("clunk");
      return;
    }
    act(calls, { sound: "clunk" });
    window.setTimeout(() => play("pop", 1.2), 120);
    window.setTimeout(() => play("pop", 1.5), 220);
  };

  const bringToLife = () => {
    if (busyRef.current || assemblingRef.current) return;
    play("whoosh");
    assemblingRef.current = true;
    setAssembling(true);
    setAssembleKey((k) => k + 1);
  };

  const onAssembled = useCallback(() => {
    assemblingRef.current = false;
    setAssembling(false);
    setCelebrate((n) => n + 1);
    play("tada");
  }, []);

  const onPartRevealed = useCallback((p: PlacedPart, i: number, n: number) => {
    if (p.component === "core") play("clunk");
    else if (i % 3 === 0) play("tick", 0.7 + (i / Math.max(1, n)) * 0.9);
  }, []);

  const showGrownup = async () => {
    if (wish !== "closed") return;
    play("pop", 1.4);
    setWish("opening");
    // The wish freezes the exact creature on screen, so finish saving first.
    await queue.idle();
    setWish("open");
  };

  const newCreature = async () => {
    if (starting) return;
    setStarting(true);
    play("pop");
    try {
      const j = await postJson<{ id: string }>("/api/designs", { template: kit.id });
      router.push(`/lab/${j.id}?new=1`);
    } catch {
      setStarting(false);
    }
  };

  const openTab = (id: string) => {
    if (id !== tab) play("tick", 1.1);
    setTab(id);
  };

  const active = tabs.find((t) => t.id === tab) ?? tabs[0];
  const option = active.kind === "slot" ? kit.options.find((o) => o.id === active.id) : undefined;
  const editsOff = busy || assembling || hatching;

  return (
    <div className={`lab${assembling ? " is-assembling" : ""}`}>
      <header className="lab-top">
        <Link href="/" className="lab-btn icon" aria-label="Home">
          <span aria-hidden>🏠</span>
        </Link>
        <span className="lab-brand">
          <span aria-hidden>🧪</span> Creature Lab
        </span>
        <button className="lab-btn" onClick={newCreature} disabled={starting} aria-label="Invent another creature">
          <span aria-hidden>✨</span>
          <span className="lab-btn-label">New</span>
        </button>
        <button className="lab-btn" onClick={undo} disabled={!canUndo || editsOff} aria-label="Undo">
          <span aria-hidden>↩️</span>
          <span className="lab-btn-label">Undo</span>
        </button>
        <button className="lab-btn icon" onClick={() => toggleMuted()} aria-pressed={muted} aria-label={muted ? "Sound is off" : "Sound is on"}>
          <span aria-hidden>{muted ? "🔇" : "🔊"}</span>
        </button>
      </header>

      <div className="lab-grid">
        <section className="lab-stage" aria-label={`${name} on the stage`} style={{ "--bd0": backdrop[0], "--bd1": backdrop[1] } as CSSProperties}>
          <div className="lab-backdrop" aria-hidden />
          {hatching ? (
            <div className="lab-stage-loading" aria-hidden>
              🥚
            </div>
          ) : (
            <ViewerBoundary fallback={<IsoCreature parts={model.parts} className="bob" />}>
              <BrickViewer parts={model.parts} mode="alive" assembleKey={assembleKey} onAssembled={onAssembled} onPartRevealed={onPartRevealed} />
            </ViewerBoundary>
          )}
          <div className="lab-counter" aria-live="polite">
            <span aria-hidden>🧱</span> <b key={stats.pieces}>{stats.pieces}</b> bricks
          </div>
          <button className="lab-lever" onClick={shuffle} disabled={editsOff} aria-label="Shuffle: pull the lever for a surprise creature">
            <span className="lab-lever-track" aria-hidden>
              <span key={lever} className={`lab-lever-arm${lever ? " pulled" : ""}`}>
                <span className="lab-lever-knob" />
              </span>
            </span>
            <span className="lab-lever-label">Shuffle</span>
          </button>
          <button className="lab-life" onClick={bringToLife} disabled={editsOff}>
            <span aria-hidden>✨</span> Bring it to life!
          </button>
          <Confetti burst={celebrate} />
        </section>

        <aside className="lab-side" aria-label="Creature card">
          <div className="lab-card-scene">
            <div key={celebrate} className={`lab-card-flip${celebrate ? " flip" : ""}`}>
              <CreatureCard name={name} builder={builder} stats={stats} parts={model.parts} coreColor={params.colors.core} previous={prevStats} pulseKey={pulse} />
              <div className="lab-card-back" aria-hidden>
                <span>🧱</span>
              </div>
            </div>
          </div>
          <div className="lab-side-actions">
            <p className="lab-real">
              These <b>{stats.pieces}</b> real bricks can come to your house.
            </p>
            <button className="lab-grownup" onClick={showGrownup} disabled={hatching || wish !== "closed"}>
              <span aria-hidden>🙋</span> Show a grown-up
            </button>
          </div>
        </aside>

        <nav className="lab-dock" aria-label="Build your creature">
          <div className="lab-panel" id="lab-panel" role="tabpanel" aria-labelledby={`lab-tab-${active.id}`}>
            {option && <SlotPanel option={option} params={params} act={act} locked={locked(option.id)} onToggleLock={() => toggleLock(option.id)} disabled={editsOff} />}
            {active.kind === "colors" && <ColorsPanel kit={kit} params={params} act={act} locked={locked(active.id)} onToggleLock={() => toggleLock(active.id)} disabled={editsOff} />}
            {active.kind === "power" && <PowerPanel params={params} act={act} disabled={editsOff} />}
            {active.kind === "name" && <NamePanel designId={designId} params={params} act={act} disabled={editsOff} reducedMotion={reducedMotion} />}
          </div>
          <TabBar tabs={tabs} active={active.id} locks={locks} onPick={openTab} />
        </nav>
      </div>

      {wish === "open" && <WishCard designId={designId} onClose={() => setWish("closed")} />}
    </div>
  );
}
