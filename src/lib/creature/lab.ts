/**
 * Pure UI helpers for the Creature Lab screen: the tab list, a small model
 * cache so tiles the kid already saw open instantly, and the easing math used
 * by the "alive" 3D viewer.
 */
import type { ColorId } from "../catalog/colors";
import type { KitDef } from "../model/templates/types";
import { buildModel, defaultParams } from "../model/templates";
import type { DesignModel, DesignParams, PlacedPart } from "../model/types";
import { COLORS_LOCK } from "./shuffle";

export type LabTabKind = "slot" | "colors" | "power" | "name";

export interface LabTab {
  id: string;
  kind: LabTabKind;
  label: string;
  icon: string;
  /** Whether the Shuffle lever respects a padlock on this tab. */
  lockable: boolean;
}

/** Body, Legs, Head, Eyes, Tail, Back, Top (from the kit), then Colors, Power, Name. */
export function labTabs(kit: Pick<KitDef, "options">): LabTab[] {
  return [
    ...kit.options.map((o) => ({ id: o.id, kind: "slot" as const, label: o.tab?.label ?? o.label, icon: o.tab?.icon ?? "🧩", lockable: true })),
    { id: COLORS_LOCK, kind: "colors", label: "Colors", icon: "🎨", lockable: true },
    { id: "power", kind: "power", label: "Power", icon: "⚡", lockable: false },
    { id: "name", kind: "name", label: "Name", icon: "🏷️", lockable: false },
  ];
}

/** Paint zones offered as per-zone swatches in the Colors tab (the core is the Power tab). */
export const ZONES: { id: string; label: string; icon: string }[] = [
  { id: "skin", label: "Skin", icon: "🦎" },
  { id: "belly", label: "Belly", icon: "🎈" },
  { id: "feet", label: "Feet", icon: "🦶" },
  { id: "eyes", label: "Eyes", icon: "👀" },
  { id: "spikes", label: "Spikes", icon: "🦔" },
];

/**
 * Key for what a creature looks like (shape + colors). The name does not change
 * any brick, so it is left out: renaming never recompiles the model on screen.
 */
export function lookKey(params: Pick<DesignParams, "template" | "options" | "colors">): string {
  const o = Object.keys(params.options)
    .sort()
    .map((k) => `${k}=${params.options[k]}`)
    .join(",");
  const c = Object.keys(params.colors)
    .sort()
    .map((k) => `${k}=${params.colors[k]}`)
    .join(",");
  return `${params.template}|${o}|${c}`;
}

/** Tiny least-recently-used map. */
export class Lru<V> {
  private map = new Map<string, V>();
  constructor(
    private max: number,
    private onEvict?: (v: V) => void,
  ) {}
  get size() {
    return this.map.size;
  }
  get(k: string): V | undefined {
    const v = this.map.get(k);
    if (v !== undefined) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }
  has(k: string): boolean {
    return this.map.has(k);
  }
  set(k: string, v: V): void {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.max) {
      const [oldK, oldV] = this.map.entries().next().value as [string, V];
      this.map.delete(oldK);
      this.onEvict?.(oldV);
    }
  }
}

/**
 * Repaint compiled parts. The kit compiler colors every brick by its component
 * (fixed-color bricks such as pupils, the visor or wheels carry a group name or
 * "details" instead), so a colors-only change is exactly a per-component repaint.
 */
export function recolor(parts: PlacedPart[], colors: Record<string, string>): PlacedPart[] {
  return parts.map((p) => {
    const c = colors[p.component];
    return c && c !== p.colorId ? { ...p, colorId: c as ColorId } : p;
  });
}

const models = new Lru<DesignModel>(40);
const shapes = new Lru<DesignModel>(40);

/**
 * Compile (or reuse) the model for a look. Compiling a creature takes tens of
 * milliseconds, so tiles and taps share results: tapping a tile whose picture is
 * already on screen reuses the model it was drawn from, and a colors-only change
 * repaints the already-compiled shape instead of compiling again.
 */
export function labModel(params: DesignParams): DesignModel {
  const k = lookKey(params);
  const hit = models.get(k);
  if (hit) return hit;
  const colors = { ...defaultParams(params.template).colors, ...params.colors };
  const shapeKey = lookKey({ ...params, colors: {} });
  const shape = shapes.get(shapeKey);
  let m: DesignModel;
  if (shape) {
    m = {
      ...shape,
      params: { ...shape.params, colors },
      parts: recolor(shape.parts, colors),
      components: shape.components.map((c) => ({ ...c, colorId: colors[c.id] ?? c.colorId })),
    };
  } else {
    m = buildModel({ template: params.template, options: params.options, colors: params.colors });
    shapes.set(shapeKey, m);
  }
  models.set(k, m);
  return m;
}

/** easeOutBack: overshoots a little and settles, for bricks that "drop in" with a bounce. */
export function easeOutBack(u: number, overshoot = 1.70158): number {
  const t = Math.min(1, Math.max(0, u)) - 1;
  return 1 + (overshoot + 1) * t * t * t + overshoot * t * t;
}

/**
 * Per-part delay (seconds) for the "Bring it to life!" reveal: parts appear one by
 * one, about 2.5 s in total however many bricks there are (29-61 for a creature),
 * and never slower than 120 ms per brick for very small models.
 */
export function revealStep(n: number, totalSeconds = 2.5): number {
  if (n <= 1) return 0;
  return Math.min(0.12, totalSeconds / n);
}
