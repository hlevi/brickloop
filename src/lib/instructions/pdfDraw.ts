/**
 * Small drawing helpers shared by the instruction PDF and the Creature Pack
 * pages (pdf-lib, standard fonts only: no emoji, so icons are drawn as shapes).
 */
import {
  appendBezierCurve,
  clip,
  closePath,
  endPath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSpacing,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { COLORS } from "../catalog/colors";
import type { DesignModel, PlacedPart } from "../model/types";
import { renderIso, type Rendered } from "./iso";
import { stepParts } from "./steps";

export function hexColor(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Linear blend of two hex colors (t = 0 gives a, t = 1 gives b). */
export function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return "#" + [c(r1, r2), c(g1, g2), c(b1, b2)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Relative luminance (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Maps render coordinates to PDF coordinates for a render drawn by drawRender. */
export interface RenderFit {
  tx: (px: number) => number;
  ty: (py: number) => number;
  scale: number;
  offX: number;
  offTop: number;
}

export function fitRender(r: Rendered, box: Box): RenderFit {
  const pad = 0.6;
  const vw = r.maxX - r.minX + 2 * pad;
  const vh = r.maxY - r.minY + 2 * pad;
  const s = Math.min(box.w / vw, box.h / vh);
  const offX = box.x + (box.w - vw * s) / 2;
  const offTop = box.y + box.h - (box.h - vh * s) / 2; // PDF y of the render's top edge
  return { tx: (px) => offX + (px - r.minX + pad) * s, ty: (py) => offTop - (py - r.minY + pad) * s, scale: s, offX, offTop };
}

/** Draw a render into the box (x, y = bottom-left in PDF space). */
export function drawRender(page: PDFPage, r: Rendered, box: Box, font: PDFFont): RenderFit {
  const fit = fitRender(r, box);
  const { tx, ty, scale: s, offX, offTop } = fit;
  for (const op of r.ops) {
    if (op.kind === "poly") {
      const d = op.points.map((p, i) => `${i ? "L" : "M"}${(tx(p[0]) - offX).toFixed(2)},${(offTop - ty(p[1])).toFixed(2)}`).join(" ") + " Z";
      page.drawSvgPath(d, { x: offX, y: offTop, color: hexColor(op.fill), opacity: op.opacity ?? 1, borderColor: hexColor(op.fill), borderWidth: 0.15 });
    } else if (op.kind === "line") {
      page.drawLine({ start: { x: tx(op.a[0]), y: ty(op.a[1]) }, end: { x: tx(op.b[0]), y: ty(op.b[1]) }, thickness: Math.max(0.2, op.width * s), color: hexColor(op.stroke) });
    } else if (op.kind === "text") {
      const size = op.size * s;
      const w = font.widthOfTextAtSize(op.text, size);
      const x = op.anchor === "middle" ? tx(op.at[0]) - w / 2 : op.anchor === "end" ? tx(op.at[0]) - w : tx(op.at[0]);
      page.drawText(op.text, { x, y: ty(op.at[1]), size, font, color: hexColor(op.fill) });
    } else if (op.kind === "arrow") {
      const a = { x: tx(op.from[0]), y: ty(op.from[1]) };
      const b = { x: tx(op.to[0]), y: ty(op.to[1]) };
      page.drawLine({ start: a, end: b, thickness: op.width * s, color: hexColor(op.stroke) });
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const hl = 0.45 * s;
      const p1 = { x: b.x - hl * Math.cos(ang - 0.45), y: b.y - hl * Math.sin(ang - 0.45) };
      const p2 = { x: b.x - hl * Math.cos(ang + 0.45), y: b.y - hl * Math.sin(ang + 0.45) };
      const d = `M${b.x},${-b.y} L${p1.x},${-p1.y} L${p2.x},${-p2.y} Z`;
      page.drawSvgPath(d, { x: 0, y: 0, color: hexColor(op.stroke) });
    }
  }
  return fit;
}

/** SVG path (in PDF coordinates) for a closed polygon; draw it with { x: 0, y: 0 }. */
export function polygonPath(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${(-y).toFixed(2)}`).join(" ") + " Z";
}

/** SVG path (in PDF coordinates) for a rounded rectangle; draw it with { x: 0, y: 0 }. */
export function roundedRectPath({ x, y, w, h }: Box, r: number): string {
  const R = Math.max(0, Math.min(r, w / 2, h / 2));
  const T = -(y + h);
  const B = -y;
  return (
    `M${x + R},${T} H${x + w - R} A${R},${R} 0 0 1 ${x + w},${T + R} V${B - R} A${R},${R} 0 0 1 ${x + w - R},${B} ` +
    `H${x + R} A${R},${R} 0 0 1 ${x},${B - R} V${T + R} A${R},${R} 0 0 1 ${x + R},${T} Z`
  );
}

export interface ShapeStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  dash?: number[];
}

export function roundedRect(page: PDFPage, box: Box, r: number, style: ShapeStyle) {
  page.drawSvgPath(roundedRectPath(box, r), {
    x: 0,
    y: 0,
    color: style.fill ? hexColor(style.fill) : undefined,
    opacity: style.opacity,
    borderColor: style.stroke ? hexColor(style.stroke) : undefined,
    borderWidth: style.stroke ? (style.strokeWidth ?? 1) : 0,
    borderDashArray: style.dash,
  });
}

/** Clip to a rounded rectangle while `draw` runs. */
export function withRoundedClip(page: PDFPage, box: Box, r: number, draw: () => void) {
  const { x, y, w, h } = box;
  const R = Math.max(0, Math.min(r, w / 2, h / 2));
  const k = 0.5523 * R;
  page.pushOperators(
    pushGraphicsState(),
    moveTo(x + R, y),
    lineTo(x + w - R, y),
    appendBezierCurve(x + w - R + k, y, x + w, y + R - k, x + w, y + R),
    lineTo(x + w, y + h - R),
    appendBezierCurve(x + w, y + h - R + k, x + w - R + k, y + h, x + w - R, y + h),
    lineTo(x + R, y + h),
    appendBezierCurve(x + R - k, y + h, x, y + h - R + k, x, y + h - R),
    lineTo(x, y + R),
    appendBezierCurve(x, y + R - k, x + R - k, y, x + R, y),
    closePath(),
    clip(),
    endPath(),
  );
  draw();
  page.pushOperators(popGraphicsState());
}

/** A vertical gradient (top color to bottom color) inside a rounded rectangle. */
export function gradientRect(page: PDFPage, box: Box, r: number, top: string, bottom: string, bands = 48) {
  withRoundedClip(page, box, r, () => {
    const bh = box.h / bands;
    for (let i = 0; i < bands; i++) {
      const c = mixHex(top, bottom, bands === 1 ? 0 : i / (bands - 1));
      // Slight overlap avoids hairline seams between bands in some viewers.
      page.drawRectangle({ x: box.x, y: box.y + box.h - (i + 1) * bh, width: box.w, height: bh + 0.6, color: hexColor(c) });
    }
  });
}

/** A star with `n` points centered at (cx, cy). */
export function star(page: PDFPage, cx: number, cy: number, outer: number, inner: number, style: ShapeStyle, n = 5, rotation = 0) {
  const pts: [number, number][] = [];
  for (let i = 0; i < 2 * n; i++) {
    const a = rotation + Math.PI / 2 + (i * Math.PI) / n;
    const rr = i % 2 === 0 ? outer : inner;
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  page.drawSvgPath(polygonPath(pts), {
    x: 0,
    y: 0,
    color: style.fill ? hexColor(style.fill) : undefined,
    opacity: style.opacity,
    borderColor: style.stroke ? hexColor(style.stroke) : undefined,
    borderWidth: style.stroke ? (style.strokeWidth ?? 1) : 0,
  });
}

/** A four-pointed sparkle. */
export function sparkle(page: PDFPage, cx: number, cy: number, size: number, fill: string, opacity = 1) {
  star(page, cx, cy, size, size * 0.28, { fill, opacity }, 4);
}

/**
 * A faceted gem in the power-core color (cx, cy = center; size = width).
 * Drawn from shapes because the standard PDF fonts cannot render emoji.
 */
export function gem(page: PDFPage, cx: number, cy: number, size: number, hex: string, ink = "#1d1d1f") {
  const w = size / 2;
  const top = cy + size * 0.36;
  const girdle = cy + size * 0.08;
  const bottom = cy - size * 0.46;
  const tableL = cx - w * 0.5;
  const tableR = cx + w * 0.5;
  const light = mixHex(hex, "#ffffff", 0.45);
  const mid = hex;
  const dark = mixHex(hex, "#000000", 0.28);
  const sw = Math.max(0.6, size * 0.045);
  const face = (pts: [number, number][], fill: string) => page.drawSvgPath(polygonPath(pts), { x: 0, y: 0, color: hexColor(fill), borderColor: hexColor(ink), borderWidth: sw });
  // Crown: table and two side facets.
  face([[cx - w, girdle], [tableL, top], [tableR, top], [cx + w, girdle]], light);
  face([[tableL, top], [tableR, top], [cx + w * 0.3, girdle], [cx - w * 0.3, girdle]], mixHex(light, "#ffffff", 0.35));
  // Pavilion: three facets meeting at the culet.
  face([[cx - w, girdle], [cx - w * 0.3, girdle], [cx, bottom]], mid);
  face([[cx - w * 0.3, girdle], [cx + w * 0.3, girdle], [cx, bottom]], mixHex(mid, "#ffffff", 0.2));
  face([[cx + w * 0.3, girdle], [cx + w, girdle], [cx, bottom]], dark);
  // Glint.
  sparkle(page, cx - w * 0.45, top + size * 0.02, size * 0.13, "#ffffff");
}

/** Five stat pips as drawn circles; returns the total width. */
export function pips(page: PDFPage, x: number, cy: number, value: number, opts: { r: number; gap: number; on: string; off: string; ink: string; strokeWidth?: number }) {
  for (let i = 0; i < 5; i++) {
    page.drawCircle({
      x: x + opts.r + i * (2 * opts.r + opts.gap),
      y: cy,
      size: opts.r,
      color: hexColor(i < value ? opts.on : opts.off),
      borderColor: hexColor(opts.ink),
      borderWidth: opts.strokeWidth ?? Math.max(0.6, opts.r * 0.28),
    });
  }
  return 5 * 2 * opts.r + 4 * opts.gap;
}

/** Largest font size from max down to min (in 0.5 steps) at which `text` fits `maxW`. */
export function fitSize(font: PDFFont, text: string, maxW: number, max: number, min: number): number {
  let s = max;
  while (s > min && font.widthOfTextAtSize(text, s) > maxW) s -= 0.5;
  return s;
}

/** Greedy word wrap. */
export function wrapLines(font: PDFFont, text: string, size: number, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && font.widthOfTextAtSize(next, size) > maxW) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export interface TextStyle {
  font: PDFFont;
  size: number;
  color?: string;
  /** Extra space between letters, in points. */
  spacing?: number;
  opacity?: number;
}

export function textWidth(text: string, st: TextStyle): number {
  return st.font.widthOfTextAtSize(text, st.size) + (st.spacing ?? 0) * Math.max(0, text.length - 1);
}

/** Draw text with optional letter spacing; anchor is where x sits. Returns the drawn width. */
export function text(page: PDFPage, s: string, x: number, y: number, st: TextStyle, anchor: "start" | "middle" | "end" = "start"): number {
  const w = textWidth(s, st);
  const left = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  if (st.spacing) page.pushOperators(setCharacterSpacing(st.spacing));
  page.drawText(s, { x: left, y, size: st.size, font: st.font, color: hexColor(st.color ?? "#1d1d1f"), opacity: st.opacity });
  if (st.spacing) page.pushOperators(setCharacterSpacing(0));
  return w;
}

export function trim(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "." : s;
}

/** A single part rendered at the origin, for parts callouts. */
export function renderSinglePart(partId: string, colorId: string): Rendered {
  const p: PlacedPart = { uid: "x", partId, colorId: colorId as PlacedPart["colorId"], x: 0, y: 0, z: 0, rot: 0, component: "", step: 1 };
  return renderIso([p]);
}

/** The "Parts for this step" callout box hanging from boxTop; returns its height. */
export function drawPartsCallout(page: PDFPage, model: DesignModel, stepIndex: number, boxTop: number, x: number, boxW: number, bold: PDFFont): number {
  const needed = stepParts(model, stepIndex);
  const itemW = 92;
  const perRow = Math.floor((boxW - 16) / itemW);
  const rows = Math.ceil(needed.length / perRow);
  const boxH = 20 + rows * 70;
  page.drawRectangle({ x, y: boxTop - boxH, width: boxW, height: boxH, borderColor: rgb(0.2, 0.4, 0.8), borderWidth: 1, color: rgb(0.95, 0.97, 1) });
  page.drawText("Parts for this step", { x: x + 8, y: boxTop - 14, size: 9, font: bold, color: rgb(0.2, 0.4, 0.8) });
  needed.forEach((n, i) => {
    const ix = x + 8 + (i % perRow) * itemW;
    const iy = boxTop - 20 - (Math.floor(i / perRow) + 1) * 70;
    drawRender(page, renderSinglePart(n.partId, n.colorId), { x: ix, y: iy + 14, w: itemW - 14, h: 52 }, bold);
    page.drawText(`${n.quantity}x  ${trim(COLORS[n.colorId]?.name ?? n.colorId, 16)}`, { x: ix + 2, y: iy + 4, size: 7.5, font: bold });
  });
  return boxH;
}
