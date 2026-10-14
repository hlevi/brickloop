import { blankCells, buildMosaic, isMosaicSize, MOSAIC_BASE_COLORS, type MosaicFinish } from "../mosaic";
import type { KitDef } from "./types";

/** A brick mosaic: a picture made of 1x1 tiles (or round dots) on a square base plate. */
export const MOSAIC: KitDef = {
  id: "mosaic",
  name: "Brick Mosaic",
  version: "1.0.0",
  ageBand: "8+",
  category: "Mosaic",
  description: "A picture made of bricks: one smooth tile or round dot per stud on a square base plate. Built row by row from a printed color map.",
  components: [{ id: "base", label: "Base plate", default: "white", allowed: MOSAIC_BASE_COLORS, synonyms: ["base", "plate", "background plate"] }],
  options: [
    { id: "size", label: "Size", values: [{ id: "8", label: "8 x 8 studs (6.4 cm)" }, { id: "16", label: "16 x 16 studs (12.8 cm)" }], default: "16", ordered: true, synonyms: ["size"] },
    { id: "finish", label: "Finish", values: [{ id: "tile", label: "Smooth tiles" }, { id: "dot", label: "Round dots" }], default: "tile", synonyms: ["finish", "tiles", "dots"] },
  ],
  build(options, colors, params) {
    const size = Number(options.size);
    if (!isMosaicSize(size)) throw new Error(`Bad mosaic size ${options.size}`);
    return buildMosaic(size, options.finish as MosaicFinish, colors.base, params.mosaic?.cells ?? blankCells(size));
  },
};
