import type { PlacedPart } from "../model/types";

/**
 * Stable identity of a placed part across recompiles. `uid` is renumbered on
 * every compile, so animations key meshes by geometry instead.
 */
export function partKey(p: Pick<PlacedPart, "partId" | "x" | "y" | "z" | "rot">): string {
  return `${p.partId}|${p.x}|${p.y}|${p.z}|${p.rot}`;
}

/** Order for the "Bring it to life!" reveal: true build order (step, then height), core last. */
export function revealOrder<T extends Pick<PlacedPart, "step" | "y" | "x" | "z" | "component">>(parts: T[]): T[] {
  return [...parts].sort((a, b) => {
    const ca = a.component === "core" ? 1 : 0;
    const cb = b.component === "core" ? 1 : 0;
    return ca - cb || a.step - b.step || a.y - b.y || a.x - b.x || a.z - b.z;
  });
}
