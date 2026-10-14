import type { PlacedPart } from "./types";

/**
 * Helpers for the "pop-up" reveal, where bricks drop in one by one when a card opens.
 * `uid` is renumbered on every compile, so animations key meshes by geometry instead.
 */
export function partKey(p: Pick<PlacedPart, "partId" | "x" | "y" | "z" | "rot">): string {
  return `${p.partId}|${p.x}|${p.y}|${p.z}|${p.rot}`;
}

/** Reveal order: true build order (step, then height, then position). */
export function revealOrder<T extends Pick<PlacedPart, "step" | "y" | "x" | "z">>(parts: T[]): T[] {
  return [...parts].sort((a, b) => a.step - b.step || a.y - b.y || a.x - b.x || a.z - b.z);
}

/** easeOutBack: overshoots a little and settles, for bricks that "drop in" with a bounce. */
export function easeOutBack(u: number, overshoot = 1.70158): number {
  const t = Math.min(1, Math.max(0, u)) - 1;
  return 1 + (overshoot + 1) * t * t * t + overshoot * t * t;
}

/** Per-part delay (seconds): about `totalSeconds` in all, never slower than 120 ms per brick. */
export function revealStep(n: number, totalSeconds = 2.5): number {
  if (n <= 1) return 0;
  return Math.min(0.12, totalSeconds / n);
}
