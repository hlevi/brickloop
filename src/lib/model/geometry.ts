import { getPart, type PartDef } from "../catalog/parts";
import type { PlacedPart, Rotation } from "./types";

export interface Footprint {
  W: number; // world x extent
  D: number; // world z extent
  H: number; // plates
}

export function footprint(p: Pick<PlacedPart, "partId" | "rot">): Footprint {
  const def = getPart(p.partId);
  const swap = p.rot === 90 || p.rot === 270;
  return { W: swap ? def.d : def.w, D: swap ? def.w : def.d, H: def.h };
}

/** Map a local cell (lx along part width, lz along part depth) to a world offset. */
export function localToWorld(def: PartDef, rot: Rotation, lx: number, lz: number): [number, number] {
  switch (rot) {
    case 0:
      return [lx, lz];
    case 180:
      return [def.w - 1 - lx, def.d - 1 - lz];
    case 90: // local back (+z) points to world +x
      return [lz, def.w - 1 - lx];
    case 270: // local back points to world -x
      return [def.d - 1 - lz, lx];
  }
}

/** World-space direction (dx, dz) of the part's local "back" (high side for slopes). */
export function backDirection(rot: Rotation): [number, number] {
  switch (rot) {
    case 0:
      return [0, 1];
    case 90:
      return [1, 0];
    case 180:
      return [0, -1];
    case 270:
      return [-1, 0];
  }
}

export interface Cell {
  x: number;
  z: number;
}

export function footprintCells(p: PlacedPart): Cell[] {
  const def = getPart(p.partId);
  const cells: Cell[] = [];
  for (let lx = 0; lx < def.w; lx++) {
    for (let lz = 0; lz < def.d; lz++) {
      const [ox, oz] = localToWorld(def, p.rot, lx, lz);
      cells.push({ x: p.x + ox, z: p.z + oz });
    }
  }
  return cells;
}

export function topStudCells(p: PlacedPart): Cell[] {
  const def = getPart(p.partId);
  if (def.topStuds === "none") return [];
  const cells: Cell[] = [];
  for (let lx = 0; lx < def.w; lx++) {
    for (let lz = 0; lz < def.d; lz++) {
      if (def.topStuds === "back-row" && lz !== def.d - 1) continue;
      const [ox, oz] = localToWorld(def, p.rot, lx, lz);
      cells.push({ x: p.x + ox, z: p.z + oz });
    }
  }
  return cells;
}

/** Choose the minimum-piece split of `length` into allowed lengths, avoiding joints at `avoid` offsets. */
export function segment(length: number, allowed: number[], avoid: Set<number> = new Set()): number[] {
  const INF = 1e9;
  const cost = new Array<number>(length + 1).fill(INF);
  const prev = new Array<number>(length + 1).fill(-1);
  cost[0] = 0;
  for (let i = 1; i <= length; i++) {
    for (const len of allowed) {
      const j = i - len;
      if (j < 0 || cost[j] >= INF) continue;
      // A joint sits at offset j (between pieces), except at the run start.
      const penalty = j > 0 && avoid.has(j) ? 100 : 0;
      const c = cost[j] + 1 + penalty;
      if (c < cost[i]) {
        cost[i] = c;
        prev[i] = j;
      }
    }
  }
  if (cost[length] >= INF) throw new Error(`Cannot segment length ${length} with ${allowed.join(",")}`);
  const out: number[] = [];
  for (let i = length; i > 0; i = prev[i]) out.unshift(i - prev[i]);
  return out;
}
