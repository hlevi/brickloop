import type { ColorId } from "../catalog/colors";
import { pixelArt, type MosaicSize } from "../model/mosaic";

/** Original pixel-art starting points for mosaic cards and the mosaic designer. */
export interface MosaicPreset {
  id: string;
  label: string;
  size: MosaicSize;
  rows: string[];
  legend: Record<string, ColorId>;
}

export const MOSAIC_PRESETS: MosaicPreset[] = [
  {
    id: "heart",
    label: "Heart",
    size: 16,
    legend: { ".": "white", r: "red", p: "bright-pink" },
    rows: [
      "................",
      "................",
      "...rrr....rrr...",
      "..rrrrr..rrrrr..",
      ".rrpprrrrrrrrrr.",
      ".rpprrrrrrrrrrr.",
      ".rprrrrrrrrrrrr.",
      ".rrrrrrrrrrrrrr.",
      "..rrrrrrrrrrrr..",
      "...rrrrrrrrrr...",
      "....rrrrrrrr....",
      ".....rrrrrr.....",
      "......rrrr......",
      ".......rr.......",
      "................",
      "................",
    ],
  },
];

export function getPreset(id: string): MosaicPreset | undefined {
  return MOSAIC_PRESETS.find((p) => p.id === id);
}

export function presetCells(id: string): string {
  const p = getPreset(id);
  if (!p) throw new Error(`Unknown mosaic preset ${id}`);
  return pixelArt(p.rows, p.legend);
}
