import { getPart } from "../catalog/parts";
import { footprintCells } from "../model/geometry";
import type { DesignModel } from "../model/types";

export interface CreatureStats {
  size: number;
  zoom: number;
  fly: number;
  armor: number;
  chomp: number;
  title: string;
  pieces: number;
}

export const STAT_LABELS: { key: keyof Omit<CreatureStats, "title" | "pieces">; label: string; icon: string }[] = [
  { key: "size", label: "Size", icon: "📏" },
  { key: "zoom", label: "Zoom", icon: "💨" },
  { key: "fly", label: "Fly", icon: "🪽" },
  { key: "armor", label: "Armor", icon: "🛡️" },
  { key: "chomp", label: "Chomp", icon: "😬" },
];

const clamp = (v: number) => Math.max(1, Math.min(5, Math.round(v)));

/**
 * Stats are a pure function of the compiled bricks, so the screen, the grown-up
 * page and the printed card always agree, and changing parts visibly matters.
 * There is no overall score and no ranking.
 */
export function creatureStats(model: Pick<DesignModel, "parts" | "steps">): CreatureStats {
  const stepTitle = new Map(model.steps.map((s) => [s.index, s.title]));
  let maxY = 0;
  let wheels = 0;
  let jet = 0;
  let armorArea = 0;
  let maxX = -Infinity;
  let bodyMaxX = -Infinity;
  let legTop = 0;
  const zs = new Set<number>();
  for (const p of model.parts) {
    const d = getPart(p.partId);
    const title = stepTitle.get(p.step);
    maxY = Math.max(maxY, p.y + d.h);
    for (const c of footprintCells(p)) {
      zs.add(c.z);
      maxX = Math.max(maxX, c.x);
      if (title === "Body") bodyMaxX = Math.max(bodyMaxX, c.x);
    }
    if (p.partId === "wheel-8x6") wheels++;
    if (p.partId === "brick-round-2x2" && p.component === "spikes") jet++;
    if ((d.shape === "slope" || d.shape === "ridge") && p.component === "spikes") armorArea += d.w * d.d;
    if (title === "Feet" || title === "Legs") legTop = Math.max(legTop, p.y + d.h);
  }
  const span = zs.size ? Math.max(...zs) - Math.min(...zs) + 1 : 0;
  const size = clamp((maxY - 14) / 4 + 1);
  const zoom = clamp(wheels ? 5 : 1 + (legTop > 0 && legTop <= 6 ? 1 : 0) + (jet ? 2 : 0));
  const fly = clamp(span > 8 ? 5 : jet ? 3 : 1);
  const armor = clamp(1 + armorArea / 4);
  const chomp = clamp(1 + (Number.isFinite(bodyMaxX) ? maxX - bodyMaxX : 0));
  // Ties resolve by a fixed priority: Zoom > Fly > Chomp > Armor > Size.
  const ranked: [number, string][] = [
    [zoom, "Super Zoomer"],
    [fly, "Super Flyer"],
    [chomp, "Super Chomper"],
    [armor, "Super Tank"],
    [size, "Super Giant"],
  ];
  let best = ranked[0];
  for (const r of ranked) if (r[0] > best[0]) best = r;
  return { size, zoom, fly, armor, chomp, title: best[1], pieces: model.parts.length };
}
