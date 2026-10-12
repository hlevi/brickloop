/**
 * Isometric renderer shared by the web step viewer (SVG) and the PDF
 * instructions. It draws from the authoritative model voxels, so diagrams
 * cannot drift from the parts list.
 *
 * View: from front-right-above. World axes: x right, y up (plates), z back.
 */
import { COLORS } from "../catalog/colors";
import { getPart } from "../catalog/parts";
import { footprint, footprintCells, localToWorld, topStudCells } from "../model/geometry";
import type { PlacedPart } from "../model/types";

export const PLATE_H = 0.4; // plate height in stud units (3.2mm / 8mm)
const STUD_R = 0.3;
const STUD_H = 0.2;
const S2 = Math.SQRT2;
const S6 = Math.sqrt(6);

export type Pt = [number, number];
export type DrawOp =
  | { kind: "poly"; points: Pt[]; fill: string; opacity?: number }
  | { kind: "line"; a: Pt; b: Pt; stroke: string; width: number }
  | { kind: "text"; at: Pt; text: string; size: number; fill: string; anchor?: "start" | "middle" | "end" }
  | { kind: "arrow"; from: Pt; to: Pt; stroke: string; width: number };

export interface RenderOptions {
  /** Parts placed in this step are highlighted; earlier parts are faded. */
  highlightStep?: number;
  /** Only parts with step <= uptoStep are drawn. */
  uptoStep?: number;
  showFrontCue?: boolean;
}

export interface Rendered {
  ops: DrawOp[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Project world (x, yUnits, z) to screen with y pointing down. */
export function project(x: number, y: number, z: number): Pt {
  return [(x + z) / S2, -(-x + 2 * y + z) / S6];
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
export function shade(hex: string, factor: number, fadeToWhite = 0): string {
  let [r, g, b] = hexToRgb(hex);
  [r, g, b] = [r * factor, g * factor, b * factor];
  if (fadeToWhite > 0) [r, g, b] = [r + (255 - r) * fadeToWhite, g + (255 - g) * fadeToWhite, b + (255 - b) * fadeToWhite];
  return rgbToHex([r, g, b]);
}

type VoxelKind = "full" | "wedge-host" | "wedge-empty" | "cyl-host" | "cyl-empty";
interface Voxel {
  uid: string;
  x: number;
  y: number; // plate index
  z: number;
  kind: VoxelKind;
  part: PlacedPart;
}

const k3 = (x: number, y: number, z: number) => `${x},${y},${z}`;

function voxelize(parts: PlacedPart[]): Map<string, Voxel> {
  const vox = new Map<string, Voxel>();
  for (const p of parts) {
    const def = getPart(p.partId);
    const fp = footprint(p);
    if (def.shape === "round" || def.shape === "wheel") {
      // one host voxel draws the whole cylinder; the rest are placeholders
      const cells = footprintCells(p);
      cells.forEach((c, i) => {
        for (let dy = 0; dy < fp.H; dy++) {
          const host = i === 0 && dy === 0;
          vox.set(k3(c.x, p.y + dy, c.z), { uid: p.uid, x: c.x, y: p.y + dy, z: c.z, kind: host ? "cyl-host" : "cyl-empty", part: p });
        }
      });
      continue;
    }
    for (let lx = 0; lx < def.w; lx++) {
      for (let lz = 0; lz < def.d; lz++) {
        const [ox, oz] = localToWorld(def, p.rot, lx, lz);
        const isSlopeRow = (def.shape === "slope" && lz < def.d - 1) || def.shape === "ridge";
        for (let dy = 0; dy < fp.H; dy++) {
          let kind: VoxelKind = "full";
          if (isSlopeRow && dy === 1) kind = "wedge-host";
          else if (isSlopeRow && dy === 2) kind = "wedge-empty";
          vox.set(k3(p.x + ox, p.y + dy, p.z + oz), { uid: p.uid, x: p.x + ox, y: p.y + dy, z: p.z + oz, kind, part: p });
        }
      }
    }
  }
  return vox;
}

export function renderIso(allParts: PlacedPart[], opts: RenderOptions = {}): Rendered {
  const parts = opts.uptoStep ? allParts.filter((p) => p.step <= opts.uptoStep!) : allParts;
  const vox = voxelize(parts);
  const ops: DrawOp[] = [];
  const isFull = (x: number, y: number, z: number) => vox.get(k3(x, y, z))?.kind === "full";
  const uidAt = (x: number, y: number, z: number) => vox.get(k3(x, y, z))?.uid;

  const colorsFor = (p: PlacedPart) => {
    const base = COLORS[p.colorId]?.hex ?? "#999999";
    const highlighted = opts.highlightStep === undefined || p.step === opts.highlightStep;
    const fade = highlighted ? 0 : 0.55;
    return {
      top: shade(base, 1.08, fade),
      front: shade(base, 0.9, fade),
      right: shade(base, 0.72, fade),
      slope: shade(base, 1.0, fade),
      edge: highlighted ? "#111111" : "#9a9a9a",
      edgeW: highlighted ? 0.035 : 0.02,
      opacity: COLORS[p.colorId]?.transparent ? 0.75 : 1,
    };
  };

  const P = (x: number, y: number, z: number) => project(x, y * PLATE_H, z);
  const poly = (pts: Pt[], fill: string, opacity = 1) => ops.push({ kind: "poly", points: pts, fill, opacity: opacity < 1 ? opacity : undefined });
  const line = (a: Pt, b: Pt, stroke: string, width: number) => ops.push({ kind: "line", a, b, stroke, width });

  // Painter's order for a regular lattice: far (low x, low y, high z) first.
  const ordered = [...vox.values()].sort((a, b) => a.x + a.y - a.z - (b.x + b.y - b.z) || a.y - b.y);

  for (const v of ordered) {
    const { x, y, z, part } = v;
    const c = colorsFor(part);
    const def = getPart(part.partId);
    if (v.kind === "wedge-empty" || v.kind === "cyl-empty") continue;

    if (v.kind === "cyl-host") {
      drawCylinder(part, c);
      continue;
    }

    if (v.kind === "wedge-host") {
      drawWedge(v, c);
      continue;
    }

    // Full voxel: draw exposed faces and their boundary edges.
    const topExposed = !isFull(x, y + 1, z);
    const frontExposed = !isFull(x, y, z - 1);
    const rightExposed = !isFull(x + 1, y, z);
    const same = (xx: number, yy: number, zz: number) => uidAt(xx, yy, zz) === v.uid && vox.get(k3(xx, yy, zz))?.kind === "full";

    if (topExposed) {
      const a = P(x, y + 1, z), b = P(x + 1, y + 1, z), cc = P(x + 1, y + 1, z + 1), d = P(x, y + 1, z + 1);
      poly([a, b, cc, d], c.top, c.opacity);
      const topSame = (xx: number, zz: number) => same(xx, y, zz) && !isFull(xx, y + 1, zz);
      if (!topSame(x, z - 1)) line(a, b, c.edge, c.edgeW);
      if (!topSame(x + 1, z)) line(b, cc, c.edge, c.edgeW);
      if (!topSame(x, z + 1)) line(cc, d, c.edge, c.edgeW);
      if (!topSame(x - 1, z)) line(d, a, c.edge, c.edgeW);
    }
    if (frontExposed) {
      const a = P(x, y, z), b = P(x + 1, y, z), cc = P(x + 1, y + 1, z), d = P(x, y + 1, z);
      poly([a, b, cc, d], c.front, c.opacity);
      const fSame = (xx: number, yy: number) => same(xx, yy, z) && !isFull(xx, yy, z - 1);
      if (!fSame(x, y - 1)) line(a, b, c.edge, c.edgeW);
      if (!fSame(x + 1, y)) line(b, cc, c.edge, c.edgeW);
      if (!fSame(x, y + 1)) line(cc, d, c.edge, c.edgeW);
      if (!fSame(x - 1, y)) line(d, a, c.edge, c.edgeW);
    }
    if (rightExposed) {
      const a = P(x + 1, y, z), b = P(x + 1, y, z + 1), cc = P(x + 1, y + 1, z + 1), d = P(x + 1, y + 1, z);
      poly([a, b, cc, d], c.right, c.opacity);
      const rSame = (yy: number, zz: number) => same(x, yy, zz) && !isFull(x + 1, yy, zz);
      if (!rSame(y - 1, z)) line(a, b, c.edge, c.edgeW);
      if (!rSame(y, z + 1)) line(b, cc, c.edge, c.edgeW);
      if (!rSame(y + 1, z)) line(cc, d, c.edge, c.edgeW);
      if (!rSame(y, z - 1)) line(d, a, c.edge, c.edgeW);
    }
    // Studs on the top layer of the part.
    const fp = footprint(part);
    if (topExposed && y === part.y + fp.H - 1 && def.topStuds !== "none") {
      if (topStudCells(part).some((s) => s.x === x && s.z === z)) drawStud(x + 0.5, (y + 1) * PLATE_H, z + 0.5, c);
    }
  }

  function drawStud(cx: number, cy: number, cz: number, c: ReturnType<typeof colorsFor>) {
    const ring = (yy: number) => {
      const pts: Pt[] = [];
      for (let i = 0; i < 16; i++) {
        const t = (i / 16) * Math.PI * 2;
        pts.push(project(cx + STUD_R * Math.cos(t), yy, cz + STUD_R * Math.sin(t)));
      }
      return pts;
    };
    const bottom = ring(cy);
    const top = ring(cy + STUD_H);
    poly(convexHull([...bottom, ...top]), c.right, c.opacity);
    poly(top, c.top, c.opacity);
    outline(top, c.edge, c.edgeW * 0.6);
  }

  function drawCylinder(p: PlacedPart, c: ReturnType<typeof colorsFor>) {
    const def = getPart(p.partId);
    const fp = footprint(p);
    if (def.shape === "round") {
      const cx = p.x + 0.5, cz = p.z + 0.5;
      const r = 0.45;
      const ring = (yy: number) => {
        const pts: Pt[] = [];
        for (let i = 0; i < 20; i++) {
          const t = (i / 20) * Math.PI * 2;
          pts.push(project(cx + r * Math.cos(t), yy, cz + r * Math.sin(t)));
        }
        return pts;
      };
      const b = ring(p.y * PLATE_H), t = ring((p.y + fp.H) * PLATE_H);
      poly(convexHull([...b, ...t]), c.front, c.opacity);
      outline(convexHull([...b, ...t]), c.edge, c.edgeW);
      poly(t, c.top, c.opacity);
      outline(t, c.edge, c.edgeW);
      drawStud(cx, (p.y + fp.H) * PLATE_H, cz, c);
      return;
    }
    // Wheel: axis along z, circle in the x-y plane.
    const cx = p.x + fp.W / 2;
    const cy = (p.y + fp.H / 2) * PLATE_H;
    const r = (fp.H * PLATE_H) / 2;
    const ring = (zz: number, rr: number) => {
      const pts: Pt[] = [];
      for (let i = 0; i < 24; i++) {
        const t = (i / 24) * Math.PI * 2;
        pts.push(project(cx + rr * Math.cos(t), cy + rr * Math.sin(t), zz));
      }
      return pts;
    };
    const front = ring(p.z + 0.15, r), back = ring(p.z + 0.85, r);
    poly(convexHull([...front, ...back]), shade("#1B1B1B", 0.8), 1);
    poly(front, "#2a2a2a", 1);
    outline(front, "#000000", c.edgeW);
    const hub = ring(p.z + 0.14, r * 0.55);
    poly(hub, c.front, 1);
    outline(hub, c.edge, c.edgeW * 0.7);
  }

  function drawWedge(v: Voxel, c: ReturnType<typeof colorsFor>) {
    // The slope surface spans plate layers 1..3 of this column, rising toward the part's high side.
    const p = v.part;
    const def = getPart(p.partId);
    const { x, z } = v;
    const y0 = v.y; // bottom of wedge (plate index)
    const y1 = y0 + 2; // top of wedge
    // Determine rise direction: toward the back row for slopes, toward the centre line for ridges.
    let dir: [number, number];
    const backWorld = (() => {
      const r = p.rot;
      return r === 0 ? [0, 1] : r === 90 ? [1, 0] : r === 180 ? [0, -1] : [-1, 0];
    })() as [number, number];
    if (def.shape === "ridge") {
      // row nearer the part's local front rises toward back, the other toward front
      const cells = footprintCells(p);
      const minProj = Math.min(...cells.map((cl) => cl.x * backWorld[0] + cl.z * backWorld[1]));
      const proj = x * backWorld[0] + z * backWorld[1];
      dir = proj === minProj ? backWorld : [-backWorld[0], -backWorld[1]];
    } else dir = backWorld;
    // Corners of the column's top square; low edge is opposite to dir.
    const corners: [number, number][] = [
      [x, z],
      [x + 1, z],
      [x + 1, z + 1],
      [x, z + 1],
    ];
    const h = ([cx, cz]: [number, number]) => {
      // fraction along dir within the cell: 0 at low edge, 1 at high edge
      const t = dir[0] !== 0 ? (dir[0] > 0 ? cx - x : x + 1 - cx) : dir[1] > 0 ? cz - z : z + 1 - cz;
      return y0 + 2 * t;
    };
    const topPts = corners.map((cr) => P(cr[0], h(cr), cr[1]));
    // side faces visible from the viewer: front (z = z) and right (x = x+1)
    const frontPoly: Pt[] = [P(x, y0, z), P(x + 1, y0, z), P(x + 1, h([x + 1, z]), z), P(x, h([x, z]), z)];
    const rightPoly: Pt[] = [P(x + 1, y0, z), P(x + 1, y0, z + 1), P(x + 1, h([x + 1, z + 1]), z + 1), P(x + 1, h([x + 1, z]), z)];
    const vfull = (xx: number, zz: number) => isFull(xx, y0, zz) || isFull(xx, y1 - 1, zz);
    if (!vfull(x, z - 1)) {
      poly(frontPoly, c.front, c.opacity);
      outline(frontPoly, c.edge, c.edgeW);
    }
    if (!vfull(x + 1, z)) {
      poly(rightPoly, c.right, c.opacity);
      outline(rightPoly, c.edge, c.edgeW);
    }
    poly(topPts, c.slope, c.opacity);
    outline(topPts, c.edge, c.edgeW * 0.8);
  }

  function outline(pts: Pt[], stroke: string, width: number) {
    for (let i = 0; i < pts.length; i++) line(pts[i], pts[(i + 1) % pts.length], stroke, width);
  }

  // Bounds.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (p: Pt) => {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  };
  for (const op of ops) {
    if (op.kind === "poly") op.points.forEach(grow);
    else if (op.kind === "line") (grow(op.a), grow(op.b));
  }
  // Include the full model extents so every step of a model uses the same frame.
  for (const p of allParts) {
    const fp = footprint(p);
    for (const [xx, zz] of [
      [p.x, p.z],
      [p.x + fp.W, p.z],
      [p.x, p.z + fp.D],
      [p.x + fp.W, p.z + fp.D],
    ])
      for (const yy of [p.y, p.y + fp.H + 1]) grow(P(xx, yy, zz));
  }
  if (!Number.isFinite(minX)) (minX = 0), (minY = 0), (maxX = 1), (maxY = 1);

  if (opts.showFrontCue) {
    // Arrow below the model pointing at the front face, labeled FRONT.
    const xs = allParts.map((p) => p.x + footprint(p).W);
    const width = Math.max(1, ...xs);
    const from = project(width / 2, 0, -2.6);
    const to = project(width / 2, 0, -0.6);
    ops.push({ kind: "arrow", from, to, stroke: "#d0021b", width: 0.08 });
    ops.push({ kind: "text", at: [from[0] - 0.2, from[1] + 0.55], text: "FRONT", size: 0.55, fill: "#d0021b", anchor: "middle" });
    grow([from[0] - 1.5, from[1] + 0.8]);
    grow([from[0] + 1.5, from[1]]);
  }
  return { ops, minX, minY, maxX, maxY };
}

export function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Serialize a render to a standalone SVG string. */
export function toSvg(r: Rendered, opts: { width?: number; padding?: number; background?: string } = {}): string {
  const pad = opts.padding ?? 0.8;
  const vbX = r.minX - pad, vbY = r.minY - pad;
  const vbW = r.maxX - r.minX + 2 * pad, vbH = r.maxY - r.minY + 2 * pad;
  const width = opts.width ?? 480;
  const height = Math.round((width * vbH) / vbW);
  const f = (n: number) => n.toFixed(3);
  const body = r.ops
    .map((op) => {
      switch (op.kind) {
        case "poly":
          return `<polygon points="${op.points.map((p) => `${f(p[0])},${f(p[1])}`).join(" ")}" fill="${op.fill}"${op.opacity ? ` fill-opacity="${op.opacity}"` : ""} stroke="${op.fill}" stroke-width="0.01"/>`;
        case "line":
          return `<line x1="${f(op.a[0])}" y1="${f(op.a[1])}" x2="${f(op.b[0])}" y2="${f(op.b[1])}" stroke="${op.stroke}" stroke-width="${op.width}" stroke-linecap="round"/>`;
        case "text":
          return `<text x="${f(op.at[0])}" y="${f(op.at[1])}" font-size="${op.size}" font-family="Helvetica, Arial, sans-serif" font-weight="bold" fill="${op.fill}" text-anchor="${op.anchor ?? "start"}">${op.text}</text>`;
        case "arrow": {
          const [x1, y1] = op.from, [x2, y2] = op.to;
          const ang = Math.atan2(y2 - y1, x2 - x1);
          const hl = 0.45;
          const h1: Pt = [x2 - hl * Math.cos(ang - 0.45), y2 - hl * Math.sin(ang - 0.45)];
          const h2: Pt = [x2 - hl * Math.cos(ang + 0.45), y2 - hl * Math.sin(ang + 0.45)];
          return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${op.stroke}" stroke-width="${op.width}"/><polygon points="${f(x2)},${f(y2)} ${f(h1[0])},${f(h1[1])} ${f(h2[0])},${f(h2[1])}" fill="${op.stroke}"/>`;
        }
      }
    })
    .join("");
  const bg = opts.background ? `<rect x="${f(vbX)}" y="${f(vbY)}" width="${f(vbW)}" height="${f(vbH)}" fill="${opts.background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(vbX)} ${f(vbY)} ${f(vbW)} ${f(vbH)}" width="${width}" height="${height}">${bg}${body}</svg>`;
}
