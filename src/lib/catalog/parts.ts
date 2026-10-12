/**
 * Part catalog. Dimensions: w (studs, local x), d (studs, local z), h (plates).
 * 1 brick = 3 plates. Local "back" is +z; slopes rise toward the back row.
 *
 * External ids are provisional reference data (not supplier-verified). Weight
 * data is intentionally null: no reliable per-part weight source has been
 * verified, so reuse-weight reporting shows 0% coverage instead of guessing.
 */
export type PartShape = "box" | "slope" | "ridge" | "round" | "wheelHolder" | "wheel";
export type TopStuds = "all" | "back-row" | "none";

export interface PartDef {
  id: string;
  name: string;
  category: "brick" | "plate" | "slope" | "round" | "wheel";
  w: number;
  d: number;
  h: number;
  shape: PartShape;
  topStuds: TopStuds;
  /** Whether the underside accepts studs (anti-studs) across the footprint. */
  bottomAcceptsStuds: boolean;
  /** Parts that ship with / are mounted onto this part (counted in the BOM). */
  accessories?: { partId: string; qty: number; colorId: string }[];
  bricklinkId: string;
  weightGrams: number | null;
}

const P = (p: Omit<PartDef, "bottomAcceptsStuds" | "weightGrams"> & Partial<PartDef>): PartDef => ({
  bottomAcceptsStuds: true,
  weightGrams: null,
  ...p,
});

export const PARTS: Record<string, PartDef> = Object.fromEntries(
  [
    // Bricks 1xN
    P({ id: "brick-1x1", name: "Brick 1 x 1", category: "brick", w: 1, d: 1, h: 3, shape: "box", topStuds: "all", bricklinkId: "3005" }),
    P({ id: "brick-1x2", name: "Brick 1 x 2", category: "brick", w: 2, d: 1, h: 3, shape: "box", topStuds: "all", bricklinkId: "3004" }),
    P({ id: "brick-1x3", name: "Brick 1 x 3", category: "brick", w: 3, d: 1, h: 3, shape: "box", topStuds: "all", bricklinkId: "3622" }),
    P({ id: "brick-1x4", name: "Brick 1 x 4", category: "brick", w: 4, d: 1, h: 3, shape: "box", topStuds: "all", bricklinkId: "3010" }),
    P({ id: "brick-1x6", name: "Brick 1 x 6", category: "brick", w: 6, d: 1, h: 3, shape: "box", topStuds: "all", bricklinkId: "3009" }),
    P({ id: "brick-1x2-nt", name: "Brick 1 x 2 without Bottom Tube", category: "brick", w: 2, d: 1, h: 3, shape: "box", topStuds: "all", bricklinkId: "3065" }),
    // Bricks 2xN
    P({ id: "brick-2x2", name: "Brick 2 x 2", category: "brick", w: 2, d: 2, h: 3, shape: "box", topStuds: "all", bricklinkId: "3003" }),
    P({ id: "brick-2x4", name: "Brick 2 x 4", category: "brick", w: 4, d: 2, h: 3, shape: "box", topStuds: "all", bricklinkId: "3001" }),
    // Plates
    P({ id: "plate-2x4", name: "Plate 2 x 4", category: "plate", w: 4, d: 2, h: 1, shape: "box", topStuds: "all", bricklinkId: "3020" }),
    P({ id: "plate-2x6", name: "Plate 2 x 6", category: "plate", w: 6, d: 2, h: 1, shape: "box", topStuds: "all", bricklinkId: "3795" }),
    P({ id: "plate-2x8", name: "Plate 2 x 8", category: "plate", w: 8, d: 2, h: 1, shape: "box", topStuds: "all", bricklinkId: "3034" }),
    P({ id: "plate-2x10", name: "Plate 2 x 10", category: "plate", w: 10, d: 2, h: 1, shape: "box", topStuds: "all", bricklinkId: "3832" }),
    P({ id: "plate-2x12", name: "Plate 2 x 12", category: "plate", w: 12, d: 2, h: 1, shape: "box", topStuds: "all", bricklinkId: "2445" }),
    P({ id: "plate-4x4", name: "Plate 4 x 4", category: "plate", w: 4, d: 4, h: 1, shape: "box", topStuds: "all", bricklinkId: "3031" }),
    P({ id: "plate-4x6", name: "Plate 4 x 6", category: "plate", w: 6, d: 4, h: 1, shape: "box", topStuds: "all", bricklinkId: "3032" }),
    P({ id: "plate-4x10", name: "Plate 4 x 10", category: "plate", w: 10, d: 4, h: 1, shape: "box", topStuds: "all", bricklinkId: "3030" }),
    P({ id: "plate-6x6", name: "Plate 6 x 6", category: "plate", w: 6, d: 6, h: 1, shape: "box", topStuds: "all", bricklinkId: "3958" }),
    P({ id: "plate-6x8", name: "Plate 6 x 8", category: "plate", w: 8, d: 6, h: 1, shape: "box", topStuds: "all", bricklinkId: "3036" }),
    P({ id: "plate-6x10", name: "Plate 6 x 10", category: "plate", w: 10, d: 6, h: 1, shape: "box", topStuds: "all", bricklinkId: "3033" }),
    P({ id: "plate-round-1x1", name: "Plate Round 1 x 1", category: "round", w: 1, d: 1, h: 1, shape: "round", topStuds: "all", bricklinkId: "4073" }),
    // Slopes (45 degrees): low edge toward local -z, studs on the back row.
    P({ id: "slope-45-2x2", name: "Slope 45 2 x 2", category: "slope", w: 2, d: 2, h: 3, shape: "slope", topStuds: "back-row", bricklinkId: "3039" }),
    P({ id: "slope-45-2x4", name: "Slope 45 2 x 4", category: "slope", w: 4, d: 2, h: 3, shape: "slope", topStuds: "back-row", bricklinkId: "3037" }),
    P({ id: "ridge-45-2x2", name: "Slope 45 2 x 2 Double", category: "slope", w: 2, d: 2, h: 3, shape: "ridge", topStuds: "none", bricklinkId: "3043" }),
    P({ id: "ridge-45-2x4", name: "Slope 45 2 x 4 Double", category: "slope", w: 4, d: 2, h: 3, shape: "ridge", topStuds: "none", bricklinkId: "3041" }),
    // Wheels: holder plate + wheel assemblies (wheel rim + tire counted as accessory).
    P({ id: "plate-2x2-wheel-holder", name: "Plate 2 x 2 with Wheel Holders", category: "plate", w: 2, d: 2, h: 1, shape: "wheelHolder", topStuds: "all", bricklinkId: "4600" }),
    P({
      id: "wheel-8x6",
      name: "Wheel 8mm D. x 6mm with Slot",
      category: "wheel",
      w: 2,
      d: 1,
      h: 3,
      shape: "wheel",
      topStuds: "none",
      bottomAcceptsStuds: false,
      bricklinkId: "4624",
      accessories: [{ partId: "tire-14x4", qty: 1, colorId: "black" }],
    }),
    P({ id: "tire-14x4", name: "Tire 14mm D. x 4mm Smooth Small Single", category: "wheel", w: 1, d: 1, h: 1, shape: "wheel", topStuds: "none", bottomAcceptsStuds: false, bricklinkId: "3641" }),
  ].map((p) => [p.id, p]),
);

export function getPart(id: string): PartDef {
  const p = PARTS[id];
  if (!p) throw new Error(`Unknown part ${id}`);
  return p;
}

/** Lengths available for 1-wide bricks, keyed by stud length. */
export const BRICK_1X_BY_LEN: Record<number, string> = { 1: "brick-1x1", 2: "brick-1x2", 3: "brick-1x3", 4: "brick-1x4", 6: "brick-1x6" };
export const BRICK_2X_BY_LEN: Record<number, string> = { 2: "brick-2x2", 4: "brick-2x4" };
export const SLOPE_2X_BY_LEN: Record<number, string> = { 2: "slope-45-2x2", 4: "slope-45-2x4" };
export const RIDGE_2X_BY_LEN: Record<number, string> = { 2: "ridge-45-2x2", 4: "ridge-45-2x4" };
export const PLATE_2X_BY_LEN: Record<number, string> = { 4: "plate-2x4", 6: "plate-2x6", 8: "plate-2x8", 10: "plate-2x10", 12: "plate-2x12" };
export const PLATE_6X_BY_LEN: Record<number, string> = { 6: "plate-6x6", 8: "plate-6x8", 10: "plate-6x10" };
