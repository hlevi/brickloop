/**
 * Kit compiler: turns a layered voxel blueprint into concrete part placements.
 *
 * A blueprint is a stack of layers (bottom to top). Each layer is a plan view
 * (rows[0] is the BACK of the model, the last row is the FRONT; columns run
 * left to right) of single-character cells mapped through a legend to a
 * component (customizable color) or a fixed color. The compiler packs each
 * layer into real parts, preferring large parts that bridge the joints of the
 * layer below so the model holds together. Slopes and ridges are declared in
 * the legend. Everything downstream (validation, BOM, preview, instructions)
 * works on the compiled placements.
 */
import type { ColorId } from "../catalog/colors";
import { getPart, PARTS } from "../catalog/parts";
import { footprintCells } from "./geometry";
import type { BuildStep, PlacedPart, Rotation } from "./types";

export type LayerKind = "brick" | "plate" | "tile";
/** Direction the LOW edge of a slope faces. */
export type Facing = "front" | "back" | "left" | "right";

export interface LegendEntry {
  /** Customizable component whose color this cell takes. */
  component?: string;
  /** Fixed color (used when no component is given, e.g. eyes). */
  color?: ColorId;
  /** Restrict packing to these part ids (e.g. round 1x1, window bricks). */
  parts?: string[];
  /** Cells form 2-deep slope strips whose low edge faces this way. */
  slope?: Facing;
  /** Cells form 2-deep ridge strips running along this axis. */
  ridge?: "x" | "z";
  /** Component used for BOM grouping when the color is fixed. */
  group?: string;
  /** Use thinner parts for these cells inside a thicker layer (e.g. tiles in a brick layer). */
  kind?: LayerKind;
}

export interface LayerSpec {
  kind: LayerKind;
  rows: string[];
  /** Starting a new instruction step at this layer. */
  step?: string;
  note?: string;
}

export interface ExtraPart {
  partId: string;
  component?: string;
  color?: ColorId;
  x: number;
  y: number;
  z: number;
  rot?: Rotation;
  /** Index into extras of the host part (pin attachment, e.g. wheel to holder). */
  attachTo?: number;
  /** Step title this part belongs to (defaults to the last step). */
  step?: string;
}

export interface Blueprint {
  layers: LayerSpec[];
  legend: Record<string, LegendEntry>;
  extras?: ExtraPart[];
  /** Steps placed BEFORE the layer steps (e.g. wheels under a chassis). */
  preSteps?: { title: string; note?: string }[];
  /** Extra steps that only contain extras, appended in order. */
  extraSteps?: { title: string; note?: string }[];
  /** Height (plates) at which the first layer starts; extras may sit below it. */
  baseY?: number;
}

const LAYER_H: Record<LayerKind, number> = { brick: 3, plate: 1, tile: 1 };

interface Candidate {
  partId: string;
  w: number;
  d: number;
}

function candidatesFor(kind: LayerKind, restrict?: string[]): Candidate[] {
  const list = restrict
    ? restrict.map((id) => getPart(id))
    : Object.values(PARTS).filter((p) => p.category === kind && p.shape === "box" && p.id !== "brick-1x2-nt");
  return list.map((p) => ({ partId: p.id, w: p.w, d: p.d })).sort((a, b) => b.w * b.d - a.w * a.d);
}

const SLOPE_BY_WIDTH: Record<number, string> = { 4: "slope-45-2x4", 2: "slope-45-2x2", 1: "slope-45-2x1" };
const RIDGE_BY_WIDTH: Record<number, string> = { 4: "ridge-45-2x4", 2: "ridge-45-2x2" };

export interface CompiledKit {
  parts: PlacedPart[];
  steps: BuildStep[];
}

export function compileBlueprint(bp: Blueprint, colors: Record<string, ColorId>): CompiledKit {
  const depth = bp.layers[0]?.rows.length ?? 0;
  for (const [i, l] of bp.layers.entries()) {
    if (l.rows.length !== depth) throw new Error(`Layer ${i} has ${l.rows.length} rows; expected ${depth}`);
  }
  const parts: PlacedPart[] = [];
  const steps: BuildStep[] = (bp.preSteps ?? []).map((s, i) => ({ index: i + 1, title: s.title, note: s.note }));
  let n = 0;
  const colorOf = (e: LegendEntry): ColorId => {
    const c = e.component ? colors[e.component] : e.color;
    if (!c) throw new Error(`No color for legend entry ${JSON.stringify(e)}`);
    return c;
  };
  // Height-indexed map of which part's TOP surface is at (x, y, z): used to bridge joints.
  const topAt = new Map<string, string>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  // Union-find of parts connected so far (bottom-up), used to bridge separate groups.
  const parent = new Map<string, string>();
  const find = (u: string): string => {
    let r = u;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(u, r);
    return r;
  };
  const add = (p: Omit<PlacedPart, "uid">, below: Iterable<string> = []): PlacedPart => {
    const placed = { uid: `p${++n}`, ...p };
    parts.push(placed);
    parent.set(placed.uid, placed.uid);
    for (const b of below) parent.set(find(b), find(placed.uid));
    const top = p.y + getPart(p.partId).h;
    for (const c of footprintCells(placed)) topAt.set(key(c.x, top, c.z), placed.uid);
    return placed;
  };

  let y = bp.baseY ?? 0;
  for (const [li, layer] of bp.layers.entries()) {
    if (layer.step || li === 0) steps.push({ index: steps.length + 1, title: layer.step ?? "Base", note: layer.note });
    const step = steps.length;
    const D = layer.rows.length;
    const W = Math.max(...layer.rows.map((r) => r.length));
    const cell = (x: number, z: number): string => {
      if (x < 0 || z < 0 || x >= W || z >= D) return ".";
      const ch = layer.rows[D - 1 - z][x] ?? ".";
      return ch === " " ? "." : ch;
    };
    const used = new Set<string>();
    const k2 = (x: number, z: number) => `${x},${z}`;

    // 1) Slopes and ridges: 2-deep strips, segmented into available widths.
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        const ch = cell(x, z);
        const e = bp.legend[ch];
        if (!e || (!e.slope && !e.ridge) || used.has(k2(x, z))) continue;
        // Strip axis: slopes facing front/back and ridges along x run along x.
        const alongX = e.ridge ? e.ridge === "x" : e.slope === "front" || e.slope === "back";
        // Measure run length along the strip axis where both depth cells match.
        const at = (i: number, j: number) => (alongX ? [x + i, z + j] : [x + j, z + i]) as [number, number];
        let len = 0;
        while (true) {
          const [ax, az] = at(len, 0);
          const [bx, bz] = at(len, 1);
          if (cell(ax, az) === ch && cell(bx, bz) === ch && !used.has(k2(ax, az)) && !used.has(k2(bx, bz))) len++;
          else break;
        }
        if (len === 0) throw new Error(`Slope cell '${ch}' at ${x},${z} is not part of a 2-deep strip`);
        const table = e.ridge ? RIDGE_BY_WIDTH : SLOPE_BY_WIDTH;
        const widths = Object.keys(table).map(Number).sort((a, b) => b - a);
        let off = 0;
        while (off < len) {
          const wdt = widths.find((wd) => wd <= len - off);
          if (!wdt) throw new Error(`Cannot fill ridge strip of length ${len - off} at ${x},${z}`);
          const [sx, sz] = at(off, 0);
          let rot: Rotation;
          if (e.ridge) rot = alongX ? 0 : 90;
          else rot = e.slope === "front" ? 0 : e.slope === "back" ? 180 : e.slope === "right" ? 270 : 90;
          const below = new Set<string>();
          for (let i = off; i < off + wdt; i++) for (const j of [0, 1]) {
            const [bx, bz] = at(i, j);
            const u = topAt.get(key(bx, y, bz));
            if (u) below.add(u);
          }
          add({ partId: table[wdt], colorId: colorOf(e), x: sx, y, z: sz, rot, component: e.component ?? e.group ?? "details", step }, below);
          for (let i = off; i < off + wdt; i++) for (const j of [0, 1]) used.add(k2(...at(i, j)));
          off += wdt;
        }
      }
    }

    // 2) Everything else: greedy packing from the first free cell, bridging joints below.
    // Try four scan directions and keep the packing with the fewest unsupported parts.
    type Placement = { partId: string; e: LegendEntry; x: number; z: number; rot: Rotation; below: Set<string> };
    const packVariant = (sx: 1 | -1, sz: 1 | -1, xFirst: boolean): { placements: Placement[]; unsupported: number } => {
      const local = new Set(used);
      const placements: Placement[] = [];
      let unsupported = 0;
      const xs = [...Array(W).keys()];
      const zs = [...Array(D).keys()];
      if (sx < 0) xs.reverse();
      if (sz < 0) zs.reverse();
      const order: [number, number][] = [];
      if (xFirst) for (const xx of xs) for (const zz of zs) order.push([xx, zz]);
      else for (const zz of zs) for (const xx of xs) order.push([xx, zz]);
      // Phase A (support first): cover each unsupported cell with a part that also reaches support.
      if (y > (bp.baseY ?? 0)) {
        const unsupportedCells = order.filter(([x, z]) => {
          const ch = cell(x, z);
          const e = bp.legend[ch];
          return ch !== "." && e && !e.parts && !local.has(k2(x, z)) && !topAt.has(key(x, y, z));
        });
        const dist = (x: number, z: number) => {
          let d = Infinity;
          for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) if (topAt.has(key(x + dx, y, z + dz))) d = Math.min(d, Math.abs(dx) + Math.abs(dz));
          return d;
        };
        unsupportedCells.sort((a, b) => dist(b[0], b[1]) - dist(a[0], a[1]));
        for (const [x, z] of unsupportedCells) {
          if (local.has(k2(x, z))) continue;
          const ch = cell(x, z);
          const e = bp.legend[ch];
          const kind = e.kind ?? layer.kind;
          let best: (Placement & { score: number; Wd: number; Dd: number; x0: number }) | null = null;
          for (const c of candidatesFor(kind)) {
            if (getPart(c.partId).h !== LAYER_H[kind]) continue;
            for (const rot of (c.w === c.d ? [0] : [0, 90]) as Rotation[]) {
              const Wd = rot === 0 ? c.w : c.d;
              const Dd = rot === 0 ? c.d : c.w;
              for (let ox = 0; ox < Wd; ox++) for (let oz = 0; oz < Dd; oz++) {
                const x0 = x - ox, z0 = z - oz;
                let ok = true;
                for (let i = 0; i < Wd && ok; i++) for (let j = 0; j < Dd && ok; j++) if (cell(x0 + i, z0 + j) !== ch || local.has(k2(x0 + i, z0 + j))) ok = false;
                if (!ok) continue;
                const below = new Set<string>();
                for (let i = 0; i < Wd; i++) for (let j = 0; j < Dd; j++) {
                  const u = topAt.get(key(x0 + i, y, z0 + j));
                  if (u) below.add(u);
                }
                if (below.size === 0) continue;
                const groups = new Set([...below].map(find));
                const score = Wd * Dd * 10 + Math.max(0, groups.size - 1) * 60 + below.size * 8;
                if (!best || score > best.score) best = { partId: c.partId, e, x: x0, z: z0, rot, below, score, Wd, Dd, x0 };
              }
            }
          }
          if (!best) continue;
          placements.push(best);
          for (let i = 0; i < best.Wd; i++) for (let j = 0; j < best.Dd; j++) local.add(k2(best.x0 + i, best.z + j));
        }
      }
      for (const [x, z] of order) {
        const ch = cell(x, z);
        if (ch === "." || local.has(k2(x, z))) continue;
        const e = bp.legend[ch];
        if (!e) throw new Error(`Unknown legend character '${ch}'`);
        const kind = e.kind ?? layer.kind;
        let best: (Placement & { score: number; Wd: number; Dd: number; x0: number }) | null = null;
        for (const c of candidatesFor(kind, e.parts)) {
          if (!e.parts && getPart(c.partId).h !== LAYER_H[kind]) continue;
          for (const rot of (c.w === c.d ? [0] : [0, 90]) as Rotation[]) {
            const Wd = rot === 0 ? c.w : c.d;
            const Dd = rot === 0 ? c.d : c.w;
            const x0 = sx > 0 ? x : x - Wd + 1;
            const z0 = sz > 0 ? z : z - Dd + 1;
            let ok = true;
            for (let i = 0; i < Wd && ok; i++) for (let j = 0; j < Dd && ok; j++) if (cell(x0 + i, z0 + j) !== ch || local.has(k2(x0 + i, z0 + j))) ok = false;
            if (!ok) continue;
            const below = new Set<string>();
            for (let i = 0; i < Wd; i++) for (let j = 0; j < Dd; j++) {
              const u = topAt.get(key(x0 + i, y, z0 + j));
              if (u) below.add(u);
            }
            const groups = new Set([...below].map(find));
            let sameRect = false;
            if (below.size === 1) {
              const bp2 = parts.find((p) => p.uid === [...below][0])!;
              const cells = footprintCells(bp2);
              const cx = cells.map((c2) => c2.x), cz = cells.map((c2) => c2.z);
              sameRect = Math.min(...cx) === x0 && Math.min(...cz) === z0 && Math.max(...cx) === x0 + Wd - 1 && Math.max(...cz) === z0 + Dd - 1;
            }
            const score =
              Wd * Dd * 10 +
              Math.max(0, groups.size - 1) * 60 + // joins separate groups: the most valuable placement
              below.size * 8 -
              (sameRect && Wd * Dd > 1 ? 25 : 0) -
              (below.size === 0 && y > (bp.baseY ?? 0) ? 200 : 0);
            if (!best || score > best.score) best = { partId: c.partId, e, x: x0, z: z0, rot, below, score, Wd, Dd, x0 };
          }
        }
        if (!best) throw new Error(`No part fits cell '${ch}' at ${x},${z} in a ${kind} layer`);
        placements.push(best);
        if (best.below.size === 0 && y > (bp.baseY ?? 0)) unsupported++;
        for (let i = 0; i < best.Wd; i++) for (let j = 0; j < best.Dd; j++) local.add(k2(best.x0 + i, best.z + j));
      }
      return { placements, unsupported };
    };
    const variants: ReturnType<typeof packVariant>[] = [];
    for (const sx of [1, -1] as const) for (const sz of [1, -1] as const) for (const xf of [false, true]) variants.push(packVariant(sx, sz, xf));
    variants.sort((a, b) => a.unsupported - b.unsupported || a.placements.length - b.placements.length);
    // Repair: re-split an unsupported part together with a neighbor so both end up supported.
    const chosen = variants[0].placements;
    if (y > (bp.baseY ?? 0)) {
      const cellsOf = (pl: Placement) => {
        const def = getPart(pl.partId);
        const Wd = pl.rot === 0 ? def.w : def.d, Dd = pl.rot === 0 ? def.d : def.w;
        const out: [number, number][] = [];
        for (let i = 0; i < Wd; i++) for (let j = 0; j < Dd; j++) out.push([pl.x + i, pl.z + j]);
        return out;
      };
      const belowOf = (cs: [number, number][]) => {
        const b = new Set<string>();
        for (const [cx, cz] of cs) {
          const u = topAt.get(key(cx, y, cz));
          if (u) b.add(u);
        }
        return b;
      };
      for (let guard = 0; guard < 50; guard++) {
        const bad = chosen.findIndex((pl) => pl.below.size === 0 && !pl.e.parts && !pl.e.slope && !pl.e.ridge);
        if (bad < 0) break;
        const pb = chosen[bad];
        const pbCells = cellsOf(pb);
        const kind = pb.e.kind ?? layer.kind;
        const cands = candidatesFor(kind).filter((c) => getPart(c.partId).h === LAYER_H[kind]);
        let fixed = false;
        for (let qi = 0; qi < chosen.length && !fixed; qi++) {
          const q = chosen[qi];
          if (qi === bad || q.e !== pb.e) continue;
          const qCells = cellsOf(q);
          const adjacent = pbCells.some(([ax, az]) => qCells.some(([bx, bz]) => Math.abs(ax - bx) + Math.abs(az - bz) === 1));
          if (!adjacent) continue;
          const U = new Set([...pbCells, ...qCells].map(([a, b2]) => k2(a, b2)));
          const coords = [...pbCells, ...qCells];
          // Try every rectangle r1 inside U; the rest must be one catalog rectangle; both supported.
          for (const [ax, az] of coords) {
            for (const c of cands) {
              for (const rot of (c.w === c.d ? [0] : [0, 90]) as Rotation[]) {
                const Wd = rot === 0 ? c.w : c.d, Dd = rot === 0 ? c.d : c.w;
                const r1: [number, number][] = [];
                for (let i = 0; i < Wd; i++) for (let j = 0; j < Dd; j++) r1.push([ax + i, az + j]);
                if (!r1.every(([a, b2]) => U.has(k2(a, b2)))) continue;
                const rest = coords.filter(([a, b2]) => !r1.some(([c1, c2]) => c1 === a && c2 === b2));
                if (rest.length === 0) continue;
                const rx = rest.map((r) => r[0]), rz = rest.map((r) => r[1]);
                const x0 = Math.min(...rx), z0 = Math.min(...rz), RW = Math.max(...rx) - x0 + 1, RD = Math.max(...rz) - z0 + 1;
                if (RW * RD !== rest.length) continue;
                const c2 = cands.find((cc) => (cc.w === RW && cc.d === RD) || (cc.w === RD && cc.d === RW));
                if (!c2) continue;
                const b1 = belowOf(r1), b2s = belowOf(rest);
                if (b1.size === 0 || b2s.size === 0) continue;
                chosen[bad] = { partId: c.partId, e: pb.e, x: ax, z: az, rot, below: b1 };
                chosen[qi] = { partId: c2.partId, e: q.e, x: x0, z: z0, rot: c2.w === RW && c2.d === RD ? 0 : 90, below: b2s };
                fixed = true;
                break;
              }
              if (fixed) break;
            }
            if (fixed) break;
          }
        }
        if (!fixed) break;
      }
    }
    for (const pl of chosen) {
      add({ partId: pl.partId, colorId: colorOf(pl.e), x: pl.x, y, z: pl.z, rot: pl.rot, component: pl.e.component ?? pl.e.group ?? "details", step }, pl.below);
    }
    y += LAYER_H[layer.kind];
  }

  // Extras (wheels, special details) placed explicitly. Pre-step extras register their tops first.
  for (const s of bp.extraSteps ?? []) steps.push({ index: steps.length + 1, title: s.title, note: s.note });
  const extraUids: string[] = [];
  for (const ex of bp.extras ?? []) {
    const step = ex.step ? steps.findIndex((s) => s.title === ex.step) + 1 : steps.length;
    if (step < 1) throw new Error(`Unknown step "${ex.step}"`);
    const placed = add({
      partId: ex.partId,
      colorId: ex.component ? colors[ex.component] : ex.color!,
      x: ex.x,
      y: ex.y,
      z: ex.z,
      rot: ex.rot ?? 0,
      component: ex.component ?? "details",
      step,
      attachedTo: ex.attachTo !== undefined ? extraUids[ex.attachTo] : undefined,
    });
    extraUids.push(placed.uid);
  }
  return { parts, steps };
}

/** Build plan rows from a function of (x, z) where z = 0 is the FRONT row. */
export function grid(W: number, D: number, f: (x: number, z: number) => string): string[] {
  const rows: string[] = [];
  for (let r = 0; r < D; r++) {
    const z = D - 1 - r;
    let s = "";
    for (let x = 0; x < W; x++) s += f(x, z) || ".";
    rows.push(s);
  }
  return rows;
}

export interface ProfileLine {
  kind: LayerKind;
  /** Side view along x; each char is a region code (or '.' for empty). */
  profile: string;
  step?: string;
  note?: string;
}

/**
 * Author a model as a side profile: each line is one layer (listed BOTTOM to TOP),
 * each region code expands across the depth (z) via a function returning the
 * legend character for (x, z), or '.' for empty.
 */
export function profileLayers(W: number, D: number, lines: ProfileLine[], regions: Record<string, (x: number, z: number) => string>): LayerSpec[] {
  return lines.map((l) => ({
    kind: l.kind,
    step: l.step,
    note: l.note,
    rows: grid(W, D, (x, z) => {
      const code = l.profile[x] ?? ".";
      if (code === "." || code === " ") return ".";
      const f = regions[code];
      if (!f) throw new Error(`Unknown profile region '${code}'`);
      return f(x, z);
    }),
  }));
}

/** Helper: fill z in [z0, z1] with ch, else '.'. */
export const span = (z0: number, z1: number, ch: string) => (_x: number, z: number) => (z >= z0 && z <= z1 ? ch : ".");
