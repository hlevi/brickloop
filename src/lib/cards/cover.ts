import { COLORS, type ColorId } from "../catalog/colors";
import { renderIso, type Rendered } from "../instructions/iso";
import { decodeCells, type MosaicFinish } from "../model/mosaic";
import type { DesignModel } from "../model/types";
import { getTheme } from "./themes";
import type { CoverPattern, CoverTheme } from "./types";

/**
 * The printed front of a card, as a list of simple shapes in a square 600 x 600
 * box (a 6 x 6 in card at 100 units per inch). The same shapes feed the web (SVG)
 * and the print file (PDF), so what the buyer previews is what gets printed.
 */
export const COVER_SIZE = 600;

export type CoverShape =
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill: string; rx?: number; opacity?: number }
  | { kind: "circle"; cx: number; cy: number; r: number; fill: string; opacity?: number }
  | { kind: "poly"; points: [number, number][]; fill: string; opacity?: number }
  | { kind: "text"; x: number; y: number; text: string; size: number; fill: string; weight: "regular" | "bold"; family: "serif" | "sans"; anchor: "start" | "middle" | "end" }
  /** The brick art, already projected; drawn into the box (x, y, w, h), aspect kept, centered. */
  | { kind: "iso"; x: number; y: number; w: number; h: number; rendered: Rendered };

export type CoverArt = { kind: "iso"; rendered: Rendered } | { kind: "mosaic"; size: number; cells: string; finish: MosaicFinish; base: ColorId };

export interface CoverInput {
  headline: string;
  theme: CoverTheme;
  art: CoverArt;
}

/** Cover art for a model: the iso render, or the flat picture for mosaics. */
export function coverArt(model: Pick<DesignModel, "template" | "params" | "parts">): CoverArt {
  if (model.template === "mosaic" && model.params.mosaic) {
    return {
      kind: "mosaic",
      size: Number(model.params.options.size),
      cells: model.params.mosaic.cells,
      finish: (model.params.options.finish as MosaicFinish) ?? "tile",
      base: model.params.colors.base ?? "white",
    };
  }
  return { kind: "iso", rendered: renderIso(model.parts) };
}

export function coverInputFor(model: Pick<DesignModel, "template" | "params" | "parts">, headline?: string, themeId?: string): CoverInput {
  return {
    headline: headline ?? model.params.card?.headline ?? "",
    theme: getTheme(themeId ?? model.params.card?.theme ?? "ivory-plain"),
    art: coverArt(model),
  };
}

/** Small deterministic PRNG so a theme's pattern is identical on every render. */
function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function heart(cx: number, cy: number, s: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 24; i++) {
    const t = (i / 24) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    pts.push([cx + (x * s) / 16, cy + (y * s) / 16]);
  }
  return pts;
}

function star(cx: number, cy: number, r: number, rot = 0): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  return pts;
}

function leaf(cx: number, cy: number, s: number, rot: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2;
    const x = Math.cos(t) * s;
    const y = Math.sin(t) * s * 0.42 * Math.abs(Math.cos(t / 2) + 0.3);
    pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return pts;
}

/** The theme's printed pattern, kept out of the art and headline area (a soft border band). */
function patternShapes(p: CoverPattern, t: CoverTheme): CoverShape[] {
  const out: CoverShape[] = [];
  const r = rng(t.id);
  const S = COVER_SIZE;
  // Scatter points in the outer band only.
  const band = (n: number, f: (x: number, y: number, i: number) => void) => {
    let placed = 0;
    for (let i = 0; placed < n && i < n * 20; i++) {
      const x = 20 + r() * (S - 40);
      const y = 20 + r() * (S - 40);
      const inner = x > 95 && x < S - 95 && y > 95 && y < S - 60;
      if (inner) continue;
      f(x, y, placed++);
    }
  };
  switch (p) {
    case "plain":
      // A thin printed frame.
      out.push({ kind: "rect", x: 22, y: 22, w: S - 44, h: S - 44, fill: t.accent, rx: 6, opacity: 0.55 });
      out.push({ kind: "rect", x: 25, y: 25, w: S - 50, h: S - 50, fill: t.bg, rx: 4 });
      break;
    case "confetti":
      band(70, (x, y, i) => {
        const w = 6 + r() * 10;
        const a = r() * Math.PI;
        const c = i % 3 === 0 ? t.ink : t.accent;
        if (i % 4 === 0) out.push({ kind: "circle", cx: x, cy: y, r: 3 + r() * 3, fill: c, opacity: 0.8 });
        else
          out.push({
            kind: "poly",
            points: [
              [x - (w / 2) * Math.cos(a), y - (w / 2) * Math.sin(a)],
              [x + (w / 2) * Math.cos(a), y + (w / 2) * Math.sin(a)],
              [x + (w / 2) * Math.cos(a) - 3 * Math.sin(a), y + (w / 2) * Math.sin(a) + 3 * Math.cos(a)],
              [x - (w / 2) * Math.cos(a) - 3 * Math.sin(a), y - (w / 2) * Math.sin(a) + 3 * Math.cos(a)],
            ],
            fill: c,
            opacity: 0.85,
          });
      });
      break;
    case "hearts":
      band(26, (x, y) => out.push({ kind: "poly", points: heart(x, y, 9 + r() * 9), fill: t.accent, opacity: 0.55 + r() * 0.35 }));
      break;
    case "stars":
      band(46, (x, y, i) => {
        if (i % 3 === 0) out.push({ kind: "poly", points: star(x, y, 6 + r() * 7, r()), fill: t.accent, opacity: 0.9 });
        else out.push({ kind: "circle", cx: x, cy: y, r: 1 + r() * 2, fill: t.ink, opacity: 0.7 });
      });
      break;
    case "dots": {
      for (let y = 30; y < S; y += 36)
        for (let x = 30 + ((y / 36) % 2) * 18; x < S; x += 36) {
          const inner = x > 95 && x < S - 95 && y > 95 && y < S - 60;
          if (!inner) out.push({ kind: "circle", cx: x, cy: y, r: 5, fill: t.accent, opacity: 0.45 });
        }
      break;
    }
    case "stripes": {
      for (let i = 0; i < 14; i++) {
        const x = i * 44 - 10;
        out.push({ kind: "poly", points: [[x, 0], [x + 18, 0], [x + 18 - 60, 60], [x - 60, 60]], fill: t.accent, opacity: 0.5 });
        out.push({ kind: "poly", points: [[x, S - 40], [x + 18, S - 40], [x + 18 - 40, S], [x - 40, S]], fill: t.accent, opacity: 0.5 });
      }
      break;
    }
    case "snow":
      band(60, (x, y, i) => {
        if (i % 5 === 0) out.push({ kind: "poly", points: star(x, y, 7, 0.3), fill: t.ink, opacity: 0.85 });
        else out.push({ kind: "circle", cx: x, cy: y, r: 1.5 + r() * 2.5, fill: t.ink, opacity: 0.75 });
      });
      break;
    case "leaves":
      band(34, (x, y) => out.push({ kind: "poly", points: leaf(x, y, 10 + r() * 9, r() * Math.PI), fill: t.accent, opacity: 0.5 + r() * 0.35 }));
      break;
    case "sunburst": {
      const cx = S / 2, cy = S * 0.46;
      for (let i = 0; i < 24; i += 2) {
        const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2;
        out.push({ kind: "poly", points: [[cx, cy], [cx + S * Math.cos(a0), cy + S * Math.sin(a0)], [cx + S * Math.cos(a1), cy + S * Math.sin(a1)]], fill: t.accent, opacity: 0.16 });
      }
      break;
    }
  }
  return out;
}

/** Rough serif advance width per character, as a fraction of the font size. */
const CHAR_W = 0.52;

/** Split a headline into at most 2 lines and pick a size that fits the card width. */
export function layoutHeadline(text: string, maxWidth = COVER_SIZE - 90): { lines: string[]; size: number } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [], size: 0 };
  const fits = (lines: string[], size: number) => lines.every((l) => l.length * CHAR_W * size <= maxWidth);
  for (const size of [54, 48, 42, 36, 32, 28, 24]) {
    if (fits([words.join(" ")], size)) return { lines: [words.join(" ")], size };
    // Best 2-line split: the one with the shortest longest line.
    let best: string[] | null = null;
    for (let i = 1; i < words.length; i++) {
      const l = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
      if (!best || Math.max(...l.map((x) => x.length)) < Math.max(...best.map((x) => x.length))) best = l;
    }
    if (best && fits(best, size)) return { lines: best, size };
  }
  const size = 22;
  const maxChars = Math.floor(maxWidth / (CHAR_W * size));
  return { lines: [text.slice(0, maxChars)], size };
}

function mosaicShapes(art: Extract<CoverArt, { kind: "mosaic" }>, x: number, y: number, w: number): CoverShape[] {
  const out: CoverShape[] = [];
  const cell = w / art.size;
  out.push({ kind: "rect", x: x - cell * 0.25, y: y - cell * 0.25, w: w + cell * 0.5, h: w + cell * 0.5, fill: COLORS[art.base]?.hex ?? "#eee", rx: cell * 0.2 });
  decodeCells(art.cells).forEach((c, i) => {
    const r = Math.floor(i / art.size), col = i % art.size;
    const hex = COLORS[c]?.hex ?? "#ccc";
    const cx = x + col * cell, cy = y + r * cell;
    if (art.finish === "dot") out.push({ kind: "circle", cx: cx + cell / 2, cy: cy + cell / 2, r: cell * 0.44, fill: hex });
    else out.push({ kind: "rect", x: cx + cell * 0.04, y: cy + cell * 0.04, w: cell * 0.92, h: cell * 0.92, fill: hex, rx: cell * 0.08 });
  });
  return out;
}

/** Card front: theme stock and pattern, the brick art in the middle, the headline below. */
export function coverLayout(input: CoverInput): CoverShape[] {
  const S = COVER_SIZE;
  const t = input.theme;
  const shapes: CoverShape[] = [{ kind: "rect", x: 0, y: 0, w: S, h: S, fill: t.bg }, ...patternShapes(t.pattern, t)];
  const head = layoutHeadline(input.headline);
  const textH = head.lines.length ? head.lines.length * head.size * 1.12 + 18 : 0;
  const artTop = 70;
  const artBottom = S - 52 - textH;
  const artH = Math.max(160, artBottom - artTop);
  if (input.art.kind === "mosaic") {
    const w = Math.min(artH, S - 220);
    shapes.push(...mosaicShapes(input.art, (S - w) / 2, artTop + (artH - w) / 2, w));
  } else {
    // A soft "stage" under the model.
    shapes.push({ kind: "circle", cx: S / 2, cy: artTop + artH * 0.55, r: Math.min(artH, S - 160) * 0.48, fill: "#ffffff", opacity: 0.38 });
    shapes.push({ kind: "iso", x: 110, y: artTop, w: S - 220, h: artH, rendered: input.art.rendered });
  }
  head.lines.forEach((line, i) => {
    shapes.push({ kind: "text", x: S / 2, y: artBottom + 26 + head.size * (0.85 + i * 1.12), text: line, size: head.size, fill: t.ink, weight: "bold", family: "serif", anchor: "middle" });
  });
  return shapes;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f = (n: number) => (Math.round(n * 100) / 100).toString();
const op = (o?: number) => (o !== undefined && o < 1 ? ` fill-opacity="${f(o)}"` : "");

/** Fonts used on the web; the PDF maps "serif" and "sans" to its own embedded faces. */
export const COVER_FONTS = { serif: "'Fraunces', 'Iowan Old Style', Georgia, serif", sans: "'Inter', 'Helvetica Neue', Arial, sans-serif" };

function isoSvg(s: Extract<CoverShape, { kind: "iso" }>): string {
  const r = s.rendered;
  const bw = r.maxX - r.minX || 1, bh = r.maxY - r.minY || 1;
  const k = Math.min(s.w / bw, s.h / bh);
  const tx = s.x + (s.w - bw * k) / 2 - r.minX * k;
  const ty = s.y + (s.h - bh * k) / 2 - r.minY * k;
  const body = r.ops
    .filter((o) => o.kind === "poly")
    .map((o) => (o.kind === "poly" ? `<polygon points="${o.points.map((p) => `${f(p[0])},${f(p[1])}`).join(" ")}" fill="${o.fill}"${op(o.opacity)} stroke="${o.fill}" stroke-width="0.01"/>` : ""))
    .join("");
  return `<g transform="translate(${f(tx)} ${f(ty)}) scale(${f(k)})">${body}</g>`;
}

export function shapesToSvg(shapes: CoverShape[], opts: { width?: number; title?: string } = {}): string {
  const width = opts.width ?? 600;
  const body = shapes
    .map((s) => {
      switch (s.kind) {
        case "rect":
          return `<rect x="${f(s.x)}" y="${f(s.y)}" width="${f(s.w)}" height="${f(s.h)}"${s.rx ? ` rx="${f(s.rx)}"` : ""} fill="${s.fill}"${op(s.opacity)}/>`;
        case "circle":
          return `<circle cx="${f(s.cx)}" cy="${f(s.cy)}" r="${f(s.r)}" fill="${s.fill}"${op(s.opacity)}/>`;
        case "poly":
          return `<polygon points="${s.points.map((p) => `${f(p[0])},${f(p[1])}`).join(" ")}" fill="${s.fill}"${op(s.opacity)}/>`;
        case "text":
          return `<text x="${f(s.x)}" y="${f(s.y)}" font-size="${f(s.size)}" font-family="${esc(COVER_FONTS[s.family])}" font-weight="${s.weight === "bold" ? 600 : 400}" fill="${s.fill}" text-anchor="${s.anchor}">${esc(s.text)}</text>`;
        case "iso":
          return isoSvg(s);
      }
    })
    .join("");
  const title = opts.title ? `<title>${esc(opts.title)}</title>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COVER_SIZE} ${COVER_SIZE}" width="${width}" height="${width}" role="img">${title}${body}</svg>`;
}

/** SVG of a card front. Text is escaped; the headline is shopper text. */
export function coverSvg(input: CoverInput, opts: { width?: number; title?: string } = {}): string {
  return shapesToSvg(coverLayout(input), opts);
}
