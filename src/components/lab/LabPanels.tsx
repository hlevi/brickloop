"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { COLORS } from "@/lib/catalog/colors";
import type { ToolCall } from "@/lib/edit/tools";
import { ZONES, type LabTab } from "@/lib/creature/lab";
import { builderChoices, currentWorld, hashSeed, identityCall, randomIdentity, seededRng, spinIndex, worldCalls } from "@/lib/creature/shuffle";
import type { SoundName } from "@/lib/creature/sound";
import { ENDINGS, POWERS, renderBuilder, TITLES, WORDS } from "@/lib/creature/words";
import { WORLDS } from "@/lib/creature/worlds";
import type { KitDef, KitOption } from "@/lib/model/templates/types";
import type { CreatureIdentity, DesignParams } from "@/lib/model/types";
import { useTileImages } from "./useTileImages";

export type Act = (calls: ToolCall[], opts?: { coalesce?: string; sound?: SoundName; pitch?: number; record?: boolean }) => boolean;

export function TabBar({ tabs, active, locks, onPick }: { tabs: LabTab[]; active: string; locks: string[]; onPick: (id: string) => void }) {
  // Arrow keys move between tabs (the usual tab-list keyboard pattern).
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === active);
    const next = tabs[(i + step + tabs.length) % tabs.length];
    onPick(next.id);
    document.getElementById(`lab-tab-${next.id}`)?.focus();
  };
  return (
    <div className="lab-tabs" role="tablist" aria-label="Creature parts" onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          id={`lab-tab-${t.id}`}
          aria-selected={t.id === active}
          aria-controls="lab-panel"
          tabIndex={t.id === active ? 0 : -1}
          className={`lab-tab${t.id === active ? " on" : ""}`}
          onClick={() => onPick(t.id)}
        >
          <span className="lab-tab-icon" aria-hidden>
            {t.icon}
          </span>
          <span className="lab-tab-label">{t.label}</span>
          {locks.includes(t.id) && (
            <span className="lab-tab-lock" aria-label="locked">
              🔒
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function LockButton({ locked, onToggle, what }: { locked: boolean; onToggle: () => void; what: string }) {
  return (
    <button className={`lab-lock${locked ? " on" : ""}`} aria-pressed={locked} aria-label={locked ? `Unlock ${what}` : `Lock ${what} so Shuffle keeps it`} onClick={onToggle}>
      <span className="lab-lock-icon" aria-hidden>
        {locked ? "🔒" : "🔓"}
      </span>
      <span className="lab-lock-label">{locked ? "Locked" : "Lock"}</span>
    </button>
  );
}

export function SlotPanel({ option, params, act, locked, onToggleLock, disabled }: { option: KitOption; params: DesignParams; act: Act; locked: boolean; onToggleLock: () => void; disabled: boolean }) {
  const current = params.options[option.id] ?? option.default;
  // Current choice first, so its picture (already compiled) appears instantly.
  const jobs = useMemo(() => {
    const vals = [...option.values].sort((a, b) => (a.id === current ? -1 : b.id === current ? 1 : 0));
    return vals.map((v) => ({ id: v.id, params: { ...params, options: { ...params.options, [option.id]: v.id } } }));
  }, [option, params, current]);
  const imgs = useTileImages(jobs);
  return (
    <div className="lab-row" role="group" aria-label={option.tab?.label ?? option.label}>
      <LockButton locked={locked} onToggle={onToggleLock} what={(option.tab?.label ?? option.label).toLowerCase()} />
      {option.values.map((v, i) => {
        const on = v.id === current;
        return (
          <button
            key={v.id}
            className={`lab-tile${on ? " on" : ""}`}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => !on && act([{ name: "set_option", input: { option: option.id, value: v.id } }], { sound: "pop", pitch: 0.9 + i * 0.12 })}
          >
            <span className="lab-tile-art">
              {imgs[v.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imgs[v.id]} alt="" draggable={false} />
              ) : (
                <span className="lab-tile-placeholder" aria-hidden>
                  {v.icon}
                </span>
              )}
            </span>
            <span className="lab-tile-label">
              <span aria-hidden>{v.icon}</span> {v.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function ColorsPanel({ kit, params, act, locked, onToggleLock, disabled }: { kit: KitDef; params: DesignParams; act: Act; locked: boolean; onToggleLock: () => void; disabled: boolean }) {
  const [mode, setMode] = useState<"worlds" | "paint">("worlds");
  const [zone, setZone] = useState(ZONES[0].id);
  const world = currentWorld(params.colors);
  const jobs = useMemo(() => WORLDS.map((w) => ({ id: w.id, params: { ...params, colors: { ...params.colors, ...w.colors } } })), [params]);
  const imgs = useTileImages(mode === "worlds" ? jobs : []);
  const comp = kit.components.find((c) => c.id === zone);
  if (mode === "paint" && comp)
    return (
      <div className="lab-paint">
        <div className="lab-row" role="group" aria-label="Paint one part">
          <button className="lab-lock lab-back" onClick={() => setMode("worlds")} aria-label="Back to worlds">
            <span className="lab-lock-icon" aria-hidden>
              🌍
            </span>
            <span className="lab-lock-label">Worlds</span>
          </button>
          {ZONES.map((z) => (
            <button key={z.id} className={`lab-zone${z.id === zone ? " on" : ""}`} aria-pressed={z.id === zone} onClick={() => setZone(z.id)}>
              <span className="lab-zone-dot" style={{ background: COLORS[params.colors[z.id]]?.hex }} aria-hidden>
                {z.icon}
              </span>
              <span className="lab-zone-label">{z.label}</span>
            </button>
          ))}
        </div>
        <div className="lab-swatches" role="group" aria-label={`${comp.label} color`}>
          {comp.allowed.map((c, i) => {
            const on = params.colors[zone] === c;
            return (
              <button
                key={c}
                className={`lab-swatch${on ? " on" : ""}`}
                aria-pressed={on}
                aria-label={COLORS[c].name}
                title={COLORS[c].name}
                disabled={disabled}
                style={{ background: COLORS[c].hex }}
                onClick={() => !on && act([{ name: "set_color", input: { component: zone, color: c } }], { sound: "pop", pitch: 1 + (i % 6) * 0.1 })}
              />
            );
          })}
        </div>
      </div>
    );
  return (
    <div className="lab-row" role="group" aria-label="Worlds">
      <LockButton locked={locked} onToggle={onToggleLock} what="colors" />
      {WORLDS.map((w, i) => {
        const on = world?.id === w.id;
        return (
          <button
            key={w.id}
            className={`lab-tile world${on ? " on" : ""}`}
            aria-pressed={on}
            disabled={disabled}
            style={{ background: `linear-gradient(160deg, ${w.backdrop[0]}, ${w.backdrop[1]})` }}
            onClick={() => !on && act(worldCalls(w, params.colors), { sound: "pop", pitch: 0.8 + i * 0.1 })}
          >
            <span className="lab-tile-art">
              {imgs[w.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imgs[w.id]} alt="" draggable={false} />
              ) : (
                <span className="lab-tile-placeholder" aria-hidden>
                  {w.icon}
                </span>
              )}
            </span>
            <span className="lab-tile-label">
              <span aria-hidden>{w.icon}</span> {w.label}
            </span>
          </button>
        );
      })}
      <button className="lab-tile paint" onClick={() => setMode("paint")}>
        <span className="lab-tile-art">
          <span className="lab-tile-placeholder" aria-hidden>
            🖌️
          </span>
        </span>
        <span className="lab-tile-label">Paint</span>
      </button>
    </div>
  );
}

export function PowerPanel({ params, act, disabled }: { params: DesignParams; act: Act; disabled: boolean }) {
  return (
    <div className="lab-row" role="group" aria-label="Power core">
      {POWERS.map((p, i) => {
        const on = params.colors.core === p.colorId;
        return (
          <button
            key={p.id}
            className={`lab-tile power${on ? " on" : ""}`}
            aria-pressed={on}
            disabled={disabled}
            style={{ "--glow": COLORS[p.colorId]?.hex } as CSSProperties}
            onClick={() => !on && act([{ name: "set_color", input: { component: "core", color: p.colorId } }], { sound: "pop", pitch: 1.2 + i * 0.15 })}
          >
            <span className="lab-tile-art">
              <span className="lab-power-orb" aria-hidden>
                {p.icon}
              </span>
            </span>
            <span className="lab-tile-label">{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const REELS = [
  { words: TITLES as readonly string[], label: "First word" },
  { words: WORDS as readonly string[], label: "Middle word" },
  { words: ENDINGS as readonly string[], label: "Ending" },
];

/**
 * One word reel, slot-machine style: the whole reel is one big button. A tap
 * spins it to the next word; a swipe down (or the up arrow key) spins it back.
 */
function Reel({ words, index, label, onSpin, disabled }: { words: readonly string[]; index: number; label: string; onSpin: (d: number) => void; disabled: boolean }) {
  const [dir, setDir] = useState<"next" | "prev">("next");
  const swipe = useRef<{ y: number; used: boolean } | null>(null);
  const n = words.length;
  const spin = (d: number) => {
    setDir(d > 0 ? "next" : "prev");
    onSpin(d);
  };
  return (
    <button
      className="lab-reel"
      aria-label={`${label}: ${words[index]}. Tap to spin.`}
      disabled={disabled}
      onPointerDown={(e) => {
        swipe.current = { y: e.clientY, used: false };
      }}
      onPointerMove={(e) => {
        const s = swipe.current;
        if (!s || s.used || (e.pointerType === "mouse" && e.buttons === 0)) return;
        const dy = e.clientY - s.y;
        if (Math.abs(dy) > 18) {
          s.used = true;
          spin(dy > 0 ? -1 : 1);
        }
      }}
      onPointerCancel={() => {
        swipe.current = null;
      }}
      onClick={() => {
        const s = swipe.current;
        swipe.current = null;
        if (s?.used) return;
        spin(1);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          spin(e.key === "ArrowDown" ? 1 : -1);
        }
      }}
    >
      <span className="lab-reel-ghost" aria-hidden>
        {words[spinIndex(index, -1, n)]}
      </span>
      <span key={index} className={`lab-reel-word ${dir}`} style={{ "--len": Math.max(4, words[index].length) } as CSSProperties}>
        {words[index]}
      </span>
      <span className="lab-reel-ghost" aria-hidden>
        {words[spinIndex(index, 1, n)]}
      </span>
    </button>
  );
}

const sameBuilder = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export function NamePanel({ designId, params, act, disabled, reducedMotion }: { designId: string; params: DesignParams; act: Act; disabled: boolean; reducedMotion: boolean }) {
  const seedBase = hashSeed(designId);
  const identity: CreatureIdentity = params.identity ?? randomIdentity(seededRng(seedBase));
  const [round, setRound] = useState(0);
  // Deterministic per design and round, so server and browser render the same tags.
  const [choices, setChoices] = useState(() => builderChoices(identity.builder, seededRng(seedBase + 1)));
  const [rolling, setRolling] = useState<CreatureIdentity["name"] | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearInterval(timer.current);
    },
    [],
  );

  const setIdentity = (next: CreatureIdentity, sound: SoundName = "tick", pitch = 1) => act([identityCall(next)], { coalesce: "identity", sound, pitch });

  const spin = (reel: number, d: number) => {
    const name = [...identity.name] as CreatureIdentity["name"];
    name[reel] = spinIndex(name[reel], d, REELS[reel].words.length);
    setIdentity({ ...identity, name }, "tick", 0.9 + reel * 0.15);
  };

  const roll = () => {
    const name = randomIdentity().name;
    setIdentity({ ...identity, name }, "pop");
    if (reducedMotion) return;
    // A quick slot-machine spin on screen; the new name is already saved.
    let ticks = 0;
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      ticks++;
      if (ticks >= 9) {
        if (timer.current) window.clearInterval(timer.current);
        timer.current = null;
        setRolling(null);
        return;
      }
      setRolling(REELS.map((r) => Math.floor(Math.random() * r.words.length)) as CreatureIdentity["name"]);
    }, 65);
  };

  const shown = rolling ?? identity.name;
  return (
    <div className="lab-name">
      <div className="lab-reels">
        {REELS.map((r, i) => (
          <Reel key={r.label} words={r.words} index={shown[i]} label={r.label} onSpin={(d) => spin(i, d)} disabled={disabled} />
        ))}
        <button className="lab-dice" onClick={roll} disabled={disabled} aria-label="Roll a random name">
          <span className={`lab-dice-icon${rolling ? " rolling" : ""}`} aria-hidden>
            🎲
          </span>
          <span className="lab-dice-label">Roll</span>
        </button>
      </div>
      <div className="lab-builders" role="group" aria-label="Invented by: pick your builder tag">
        <span className="lab-builders-label" aria-hidden>
          ✍️<span className="lab-builders-words"> Invented by</span>
        </span>
        {choices.map((b) => {
          const on = sameBuilder(b, identity.builder);
          return (
            <button
              key={b.join(",")}
              className={`lab-chip${on ? " on" : ""}`}
              aria-pressed={on}
              disabled={disabled}
              onClick={() => !on && setIdentity({ ...identity, builder: [...b] as CreatureIdentity["builder"] }, "pop", 1.3)}
            >
              {renderBuilder({ name: identity.name, builder: b })}
            </button>
          );
        })}
        <button
          className="lab-chip more"
          aria-label="More builder tags"
          disabled={disabled}
          onClick={() => {
            const r = round + 1;
            setRound(r);
            // Keep the current tag first (still picked), then two fresh ones.
            setChoices(builderChoices(identity.builder, seededRng(seedBase + 1 + r * 7919)));
          }}
        >
          <span aria-hidden>🔄</span>
          <span className="lab-chip-more-label"> More</span>
        </button>
      </div>
    </div>
  );
}
