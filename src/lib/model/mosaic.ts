import { COLORS, type ColorId } from "../catalog/colors";
import type { BuildStep, PlacedPart } from "./types";

/**
 * Brick mosaics: a square base plate covered with one 1x1 piece per cell.
 * Client-safe (no server imports): the mosaic designer builds previews in the browser.
 *
 * Cells are stored as a string, row-major, row 0 = the TOP row of the picture,
 * one character per cell = an index into MOSAIC_PALETTE (base 36).
 */
export const MOSAIC_SIZES = [8, 16] as const;
export type MosaicSize = (typeof MOSAIC_SIZES)[number];
export type MosaicFinish = "tile" | "dot";

/** Encoding order is stored data: append new colors at the end, never reorder or remove. */
export const MOSAIC_PALETTE: ColorId[] = [
  "white", "black", "red", "yellow", "blue", "green", "tan", "reddish-brown", "light-bluish-gray", "dark-bluish-gray",
  "orange", "lime", "dark-green", "bright-pink", "dark-red", "coral", "dark-pink", "magenta", "lavender", "medium-lavender",
  "dark-purple", "dark-blue", "medium-blue", "dark-azure", "medium-azure", "light-aqua", "sand-green", "bright-green", "yellowish-green", "olive-green",
  "bright-light-yellow", "bright-light-orange", "dark-orange", "light-nougat", "medium-nougat", "dark-tan",
];
export const MOSAIC_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";
export const MOSAIC_BASE_COLORS: ColorId[] = ["white", "black", "light-bluish-gray", "dark-bluish-gray", "tan", "dark-blue", "red"];

export function isMosaicSize(v: unknown): v is MosaicSize {
  return v === 8 || v === 16;
}

export function colorChar(color: ColorId): string {
  const i = MOSAIC_PALETTE.indexOf(color);
  if (i < 0) throw new Error(`${color} is not a mosaic color`);
  return MOSAIC_CHARS[i];
}

export function charColor(ch: string): ColorId | null {
  const i = MOSAIC_CHARS.indexOf(ch);
  return i >= 0 && i < MOSAIC_PALETTE.length ? MOSAIC_PALETTE[i] : null;
}

export function encodeCells(colors: ColorId[]): string {
  return colors.map(colorChar).join("");
}

export function decodeCells(cells: string): ColorId[] {
  return [...cells].map((ch) => {
    const c = charColor(ch);
    if (!c) throw new Error(`Bad mosaic cell "${ch}"`);
    return c;
  });
}

export function isValidCells(cells: unknown, size: number): cells is string {
  return typeof cells === "string" && cells.length === size * size && [...cells].every((ch) => charColor(ch) !== null);
}

export function blankCells(size: MosaicSize, color: ColorId = "white"): string {
  return colorChar(color).repeat(size * size);
}

/** Nearest-neighbor resample, used when the size option changes (16 -> 8 keeps every other cell). */
export function resampleCells(cells: string, from: number, to: number): string {
  if (from === to) return cells;
  let out = "";
  for (let r = 0; r < to; r++) {
    for (let c = 0; c < to; c++) {
      const sr = Math.min(from - 1, Math.floor(((r + 0.5) * from) / to));
      const sc = Math.min(from - 1, Math.floor(((c + 0.5) * from) / to));
      out += cells[sr * from + sc];
    }
  }
  return out;
}

/**
 * Turn pixel-art rows into cells with a small legend, e.g.
 * pixelArt(["..r..", ...], { ".": "white", r: "red" }). Every row must be `size` wide.
 */
export function pixelArt(rows: string[], legend: Record<string, ColorId>): string {
  const size = rows.length;
  return rows
    .map((row, i) => {
      if (row.length !== size) throw new Error(`Row ${i} is ${row.length} wide, expected ${size}`);
      return [...row]
        .map((ch) => {
          const c = legend[ch];
          if (!c) throw new Error(`No legend entry for "${ch}"`);
          return colorChar(c);
        })
        .join("");
    })
    .join("");
}

export const ROWS_PER_STEP = 4;

/** The parts and steps of a mosaic. Picture row r sits at z = size-1-r, so the top row is at the back. */
export function buildMosaic(size: MosaicSize, finish: MosaicFinish, base: ColorId, cells: string): { parts: PlacedPart[]; steps: BuildStep[] } {
  if (!isValidCells(cells, size)) throw new Error("Invalid mosaic cells");
  const colors = decodeCells(cells);
  const piece = finish === "dot" ? "plate-round-1x1" : "tile-1x1";
  const parts: PlacedPart[] = [{ uid: "m0", partId: size === 16 ? "plate-16x16" : "plate-8x8", colorId: base, x: 0, y: 0, z: 0, rot: 0, component: "base", step: 1 }];
  const steps: BuildStep[] = [{ index: 1, title: "Base plate", note: "Lay the base plate flat with the arrow mark at the top." }];
  for (let r = 0; r < size; r++) {
    const step = 2 + Math.floor(r / ROWS_PER_STEP);
    if (r % ROWS_PER_STEP === 0) {
      const last = Math.min(size, r + ROWS_PER_STEP);
      steps.push({ index: step, title: `Rows ${r + 1} to ${last}`, note: r === 0 ? "Rows are counted from the top of the picture. Work left to right." : undefined });
    }
    for (let c = 0; c < size; c++) {
      parts.push({ uid: `m${parts.length}`, partId: piece, colorId: colors[r * size + c], x: c, y: 1, z: size - 1 - r, rot: 0, component: "mosaic", step });
    }
  }
  return { parts, steps };
}

/** Colors used, most frequent first (for legends and parts callouts). */
export function cellHistogram(cells: string): { color: ColorId; count: number }[] {
  const counts = new Map<ColorId, number>();
  for (const c of decodeCells(cells)) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts].map(([color, count]) => ({ color, count })).sort((a, b) => b.count - a.count || COLORS[a.color].name.localeCompare(COLORS[b.color].name));
}
