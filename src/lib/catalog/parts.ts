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
  category: "brick" | "plate" | "tile" | "slope" | "round" | "wheel";
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

const brick = (w: number, d: number, bl: string, name = `Brick ${d} x ${w}`) =>
  P({ id: `brick-${d}x${w}`, name, category: "brick", w, d, h: 3, shape: "box", topStuds: "all", bricklinkId: bl });
const plate = (w: number, d: number, bl: string) =>
  P({ id: `plate-${d}x${w}`, name: `Plate ${d} x ${w}`, category: "plate", w, d, h: 1, shape: "box", topStuds: "all", bricklinkId: bl });
const tile = (w: number, d: number, bl: string) =>
  P({ id: `tile-${d}x${w}`, name: `Tile ${d} x ${w}`, category: "tile", w, d, h: 1, shape: "box", topStuds: "none", bricklinkId: bl });

export const PARTS: Record<string, PartDef> = Object.fromEntries(
  [
    // Bricks (local w = long side along x, d = depth)
    brick(1, 1, "3005"),
    brick(2, 1, "3004"),
    brick(3, 1, "3622"),
    brick(4, 1, "3010"),
    brick(6, 1, "3009"),
    brick(8, 1, "3008"),
    P({ id: "brick-1x2-nt", name: "Brick 1 x 2 without Bottom Tube", category: "brick", w: 2, d: 1, h: 3, shape: "box", topStuds: "all", bricklinkId: "3065" }),
    brick(2, 2, "3003"),
    brick(3, 2, "3002"),
    brick(4, 2, "3001"),
    brick(6, 2, "2456"),
    // Plates
    plate(1, 1, "3024"),
    plate(2, 1, "3023"),
    plate(3, 1, "3623"),
    plate(4, 1, "3710"),
    plate(6, 1, "3666"),
    plate(8, 1, "3460"),
    plate(2, 2, "3022"),
    plate(3, 2, "3021"),
    plate(4, 2, "3020"),
    plate(6, 2, "3795"),
    plate(8, 2, "3034"),
    plate(10, 2, "3832"),
    plate(12, 2, "2445"),
    plate(4, 4, "3031"),
    plate(6, 4, "3032"),
    plate(8, 4, "3035"),
    plate(10, 4, "3030"),
    plate(12, 4, "3029"),
    plate(6, 6, "3958"),
    plate(8, 6, "3036"),
    plate(10, 6, "3033"),
    plate(12, 6, "3028"),
    plate(8, 8, "41539"),
    // Tiles (smooth tops)
    tile(1, 1, "3070b"),
    tile(2, 1, "3069b"),
    tile(4, 1, "2431"),
    tile(6, 1, "6636"),
    tile(2, 2, "3068b"),
    // Round parts
    P({ id: "plate-round-1x1", name: "Plate Round 1 x 1", category: "round", w: 1, d: 1, h: 1, shape: "round", topStuds: "all", bricklinkId: "4073" }),
    P({ id: "brick-round-1x1", name: "Brick Round 1 x 1", category: "round", w: 1, d: 1, h: 3, shape: "round", topStuds: "all", bricklinkId: "3062b" }),
    P({ id: "brick-round-2x2", name: "Brick Round 2 x 2 with Axle Hole", category: "round", w: 2, d: 2, h: 3, shape: "round", topStuds: "all", bricklinkId: "3941" }),
    P({ id: "plate-round-2x2", name: "Plate Round 2 x 2 with Axle Hole", category: "round", w: 2, d: 2, h: 1, shape: "round", topStuds: "all", bricklinkId: "4032" }),
    // Slopes (45 degrees): low edge toward local -z, studs on the back row.
    P({ id: "slope-45-2x1", name: "Slope 45 2 x 1", category: "slope", w: 1, d: 2, h: 3, shape: "slope", topStuds: "back-row", bricklinkId: "3040" }),
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

