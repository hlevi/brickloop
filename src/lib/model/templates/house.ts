import { BRICK_1X_BY_LEN, BRICK_2X_BY_LEN, PLATE_6X_BY_LEN, RIDGE_2X_BY_LEN, SLOPE_2X_BY_LEN } from "../../catalog/parts";
import type { ColorId } from "../../catalog/colors";
import { segment } from "../geometry";
import type { BuildStep, ComponentDef, DesignModel, HouseParams, PlacedPart, Rotation } from "../types";

export const HOUSE_VERSION = "house-1.0.0";
export const HOUSE_WIDTHS = [6, 8, 10] as const;
export const ROOF_STYLES = ["gable", "flat"] as const;
const DEPTH = 6;
const COURSES = 4;

export const HOUSE_COLOR_OPTIONS: Record<keyof HouseParams["colors"], ColorId[]> = {
  base: ["green", "dark-bluish-gray", "light-bluish-gray", "tan"],
  walls: ["white", "red", "yellow", "tan", "light-bluish-gray", "blue"],
  windows: ["trans-clear", "trans-light-blue"],
  roof: ["red", "black", "dark-bluish-gray", "reddish-brown", "blue"],
};

export const HOUSE_DEFAULTS: HouseParams = {
  width: 8,
  roofStyle: "gable",
  colors: { base: "green", walls: "white", windows: "trans-clear", roof: "red" },
};

type Material = "wall" | "window" | "door";

interface WallLine {
  id: string;
  axis: "x" | "z";
  fixed: number; // the constant coordinate
  start: number;
  cells: Material[];
}

function wallLines(W: number, k: number): WallLine[] {
  const D = DEPTH;
  const even = k % 2 === 0;
  const doorL = W / 2 - 1;
  const lines: WallLine[] = [];
  const mk = (id: string, axis: "x" | "z", fixed: number, start: number, end: number, mat: (pos: number) => Material) => {
    const cells: Material[] = [];
    for (let p = start; p <= end; p++) cells.push(mat(p));
    lines.push({ id, axis, fixed, start, cells });
  };
  const xs = even ? [0, W - 1] : [1, W - 2];
  const zs = even ? [1, D - 2] : [0, D - 1];
  const windowCourse = k === 1 || k === 2;
  mk("front", "x", 0, xs[0], xs[1], (x) => {
    if (k < 3 && (x === doorL || x === doorL + 1)) return "door";
    if (windowCourse && W >= 10 && (x === 1 || x === 2 || x === W - 3 || x === W - 2)) return "window";
    return "wall";
  });
  mk("back", "x", D - 1, xs[0], xs[1], (x) => (windowCourse && (x === doorL || x === doorL + 1) ? "window" : "wall"));
  mk("left", "z", 0, zs[0], zs[1], (z) => (windowCourse && (z === 2 || z === 3) ? "window" : "wall"));
  mk("right", "z", W - 1, zs[0], zs[1], (z) => (windowCourse && (z === 2 || z === 3) ? "window" : "wall"));
  return lines;
}

export function buildHouse(params: HouseParams): DesignModel {
  const W = params.width;
  const c = params.colors;
  const parts: PlacedPart[] = [];
  let n = 0;
  const add = (p: Omit<PlacedPart, "uid">) => parts.push({ uid: `p${++n}`, ...p });
  const steps: BuildStep[] = [];

  // Step 1: base plate.
  steps.push({ index: 1, title: "Base plate", note: "Place the base with the long side facing you (FRONT)." });
  add({ partId: PLATE_6X_BY_LEN[W], colorId: c.base, x: 0, y: 0, z: 0, rot: 0, component: "base", step: 1 });

  // Steps 2..5: wall courses with running bond and corner interlock.
  const prevJoints = new Map<string, Set<number>>(); // line id -> absolute joint positions
  const doorEdges = new Set([W / 2 - 1, W / 2 + 1]);
  for (let k = 0; k < COURSES; k++) {
    const step = 2 + k;
    steps.push({
      index: step,
      title: `Walls, course ${k + 1}`,
      note: k === 0 ? "Leave the 2-stud gap at the front for the door." : k === 3 ? "This course bridges over the door and windows." : undefined,
    });
    const y = 1 + k * 3;
    for (const line of wallLines(W, k)) {
      const joints = new Set<number>();
      // split into runs of the same material
      let i = 0;
      while (i < line.cells.length) {
        const mat = line.cells[i];
        let j = i;
        while (j < line.cells.length && line.cells[j] === mat) j++;
        const runStart = line.start + i;
        const runLen = j - i;
        if (mat !== "door") {
          const avoidAbs = new Set<number>([...(prevJoints.get(line.id) ?? [])]);
          if (k === COURSES - 1 && line.id === "front") doorEdges.forEach((e) => avoidAbs.add(e));
          const avoidRel = new Set([...avoidAbs].map((a) => a - runStart));
          const lens = mat === "window" ? segment(runLen, [2]) : segment(runLen, [1, 2, 3, 4, 6].filter((l) => BRICK_1X_BY_LEN[l]), avoidRel);
          let pos = runStart;
          for (const len of lens) {
            const partId = mat === "window" ? "brick-1x2-nt" : BRICK_1X_BY_LEN[len];
            const colorId = mat === "window" ? c.windows : c.walls;
            if (line.axis === "x") add({ partId, colorId, x: pos, y, z: line.fixed, rot: 0, component: mat === "window" ? "windows" : "walls", step });
            else add({ partId, colorId, x: line.fixed, y, z: pos, rot: 90, component: mat === "window" ? "windows" : "walls", step });
            pos += len;
            if (pos < runStart + runLen) joints.add(pos);
          }
        }
        // material boundaries count as joints for the next course
        if (i > 0) joints.add(runStart);
        if (j < line.cells.length) joints.add(line.start + j);
        i = j;
      }
      prevJoints.set(line.id, joints);
    }
  }

  // Roof.
  const roofY = 1 + COURSES * 3;
  const roofPlateStep = 2 + COURSES;
  steps.push({ index: roofPlateStep, title: params.roofStyle === "flat" ? "Flat roof" : "Roof plate", note: "Press down firmly over every wall stud." });
  add({ partId: PLATE_6X_BY_LEN[W], colorId: c.roof, x: 0, y: roofY, z: 0, rot: 0, component: "roof", step: roofPlateStep });

  if (params.roofStyle === "gable") {
    const placeRow = (y: number, z: number, step: number, byLen: Record<number, string>, rot: Rotation, avoid: Set<number>): Set<number> => {
      const lens = segment(W, Object.keys(byLen).map(Number), avoid);
      const joints = new Set<number>();
      let x = 0;
      for (const len of lens) {
        add({ partId: byLen[len], colorId: c.roof, x, y, z, rot, component: "roof", step });
        x += len;
        if (x < W) joints.add(x);
      }
      return joints;
    };
    const s1 = roofPlateStep + 1;
    steps.push({ index: s1, title: "Roof, first layer", note: "Slopes point down toward the front and back edges." });
    const y1 = roofY + 1;
    const jf = placeRow(y1, 0, s1, SLOPE_2X_BY_LEN, 0, new Set());
    const jm = placeRow(y1, 2, s1, BRICK_2X_BY_LEN, 0, jf);
    placeRow(y1, 4, s1, SLOPE_2X_BY_LEN, 180, new Set());
    const s2 = s1 + 1;
    steps.push({ index: s2, title: "Roof, second layer" });
    const y2 = y1 + 3;
    const jf2 = placeRow(y2, 1, s2, SLOPE_2X_BY_LEN, 0, jm);
    placeRow(y2, 3, s2, SLOPE_2X_BY_LEN, 180, jm);
    const s3 = s2 + 1;
    steps.push({ index: s3, title: "Roof ridge" });
    placeRow(y2 + 3, 2, s3, RIDGE_2X_BY_LEN, 0, jf2);
  }

  const components: ComponentDef[] = [
    { id: "base", label: "Base", colorId: c.base, allowedColors: HOUSE_COLOR_OPTIONS.base },
    { id: "walls", label: "Walls", colorId: c.walls, allowedColors: HOUSE_COLOR_OPTIONS.walls },
    { id: "windows", label: "Windows", colorId: c.windows, allowedColors: HOUSE_COLOR_OPTIONS.windows },
    { id: "roof", label: "Roof", colorId: c.roof, allowedColors: HOUSE_COLOR_OPTIONS.roof },
  ];
  return {
    template: "house",
    templateVersion: HOUSE_VERSION,
    params: { template: "house", ...params },
    parts,
    components,
    steps,
    structuralKey: `${HOUSE_VERSION}:w${W}:${params.roofStyle}`,
  };
}
