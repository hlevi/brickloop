"use client";

import { useMemo } from "react";
import { renderIso, toSvg } from "@/lib/instructions/iso";
import { STAT_LABELS, type CreatureStats } from "@/lib/creature/stats";
import { powerOf } from "@/lib/creature/words";
import type { PlacedPart } from "@/lib/model/types";
import "./creature-card.css";

export interface CreatureCardProps {
  name: string;
  builder: string;
  stats: CreatureStats;
  parts: PlacedPart[];
  coreColor?: string;
  /** Previous stats, to show +1/-1 bubbles after a change. */
  previous?: CreatureStats | null;
  compact?: boolean;
  /** Changes on every edit in the Lab, so the +1/-1 bubbles and pip wiggle replay each time. */
  pulseKey?: number;
}

/** Trading card for a creature. Stats are computed from the real bricks (see lib/creature/stats). */
export default function CreatureCard({ name, builder, stats, parts, coreColor, previous, compact, pulseKey = 0 }: CreatureCardProps) {
  const svg = useMemo(() => toSvg(renderIso(parts), { width: compact ? 180 : 260 }), [parts, compact]);
  const power = powerOf(coreColor);
  return (
    <article className={`creature-card${compact ? " compact" : ""}`} aria-label={`Creature card for ${name}`}>
      <header className="cc-head">
        <span className="cc-name">{name}</span>
        <span className="cc-power" title={`${power.label} power`} aria-label={`${power.label} power`}>
          {power.icon}
        </span>
      </header>
      <div className="cc-art" dangerouslySetInnerHTML={{ __html: svg }} role="img" aria-label={`Picture of ${name}`} />
      <p className="cc-title">{stats.title}</p>
      <ul className="cc-stats">
        {STAT_LABELS.map((s) => {
          const v = stats[s.key];
          const delta = previous ? v - previous[s.key] : 0;
          return (
            <li key={s.key}>
              <span className="cc-stat-label">
                <span aria-hidden>{s.icon}</span> {s.label}
              </span>
              <span key={delta ? `${s.key}-${pulseKey}` : s.key} className={`cc-pips${delta ? " wiggle" : ""}`} aria-label={`${s.label} ${v} of 5`}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <span key={i} className={`cc-pip${i <= v ? " on" : ""}`} />
                ))}
              </span>
              {delta !== 0 ? (
                <span key={`d-${pulseKey}`} className={`cc-delta ${delta > 0 ? "up" : "down"}`}>
                  {delta > 0 ? `+${delta}` : delta}
                </span>
              ) : (
                <span className="cc-delta-slot" />
              )}
            </li>
          );
        })}
      </ul>
      <footer className="cc-foot">
        Invented by <strong>{builder}</strong> · {stats.pieces} bricks
      </footer>
    </article>
  );
}
