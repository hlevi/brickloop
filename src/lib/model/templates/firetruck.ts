import type { ColorId } from "../../catalog/colors";
import { PLATE_2X_BY_LEN } from "../../catalog/parts";
import type { BuildStep, ComponentDef, DesignModel, FiretruckParams, PlacedPart } from "../types";

export const FIRETRUCK_VERSION = "firetruck-1.0.0";
export const LADDER_LENGTHS = [6, 8, 10] as const;

export const FIRETRUCK_COLOR_OPTIONS: Record<keyof FiretruckParams["colors"], ColorId[]> = {
  body: ["red", "yellow", "white", "orange"],
  chassis: ["black", "dark-bluish-gray", "light-bluish-gray"],
  ladder: ["light-bluish-gray", "white", "dark-bluish-gray", "yellow"],
  windows: ["trans-clear", "trans-light-blue"],
};

export const FIRETRUCK_DEFAULTS: FiretruckParams = {
  ladderLength: 8,
  colors: { body: "red", chassis: "black", ladder: "light-bluish-gray", windows: "trans-clear" },
};

/**
 * Truck runs along +x (cab at the high-x end). Body occupies z = 1..4; wheels
 * sit outside the body at z = 0 and z = 5. y = 0 is the ground.
 */
export function buildFiretruck(params: FiretruckParams): DesignModel {
  const c = params.colors;
  const parts: PlacedPart[] = [];
  let n = 0;
  const add = (p: Omit<PlacedPart, "uid">) => {
    const uid = `p${++n}`;
    parts.push({ uid, ...p });
    return uid;
  };
  const steps: BuildStep[] = [
    { index: 1, title: "Wheels", note: "Push each wheel onto a holder pin. The cab end points to the right." },
    { index: 2, title: "Chassis" },
    { index: 3, title: "Cab and body, first layer" },
    { index: 4, title: "Cab windows and body, second layer" },
    { index: 5, title: "Roof plates" },
    { index: 6, title: "Ladder", note: "The ladder extends forward over the cab." },
  ];

  // Step 1: wheel holders and wheels.
  for (const hx of [1, 7]) {
    const holder = add({ partId: "plate-2x2-wheel-holder", colorId: "black", x: hx, y: 1, z: 2, rot: 0, component: "chassis", step: 1 });
    add({ partId: "wheel-8x6", colorId: "light-bluish-gray", x: hx, y: 0, z: 0, rot: 0, component: "wheels", step: 1, attachedTo: holder });
    add({ partId: "wheel-8x6", colorId: "light-bluish-gray", x: hx, y: 0, z: 5, rot: 0, component: "wheels", step: 1, attachedTo: holder });
  }
  // Step 2: chassis plate.
  add({ partId: "plate-4x10", colorId: c.chassis, x: 0, y: 2, z: 1, rot: 0, component: "chassis", step: 2 });

  // Step 3: first layer (y=3).
  add({ partId: "brick-2x4", colorId: c.body, x: 0, y: 3, z: 1, rot: 0, component: "body", step: 3 });
  add({ partId: "brick-2x4", colorId: c.body, x: 0, y: 3, z: 3, rot: 0, component: "body", step: 3 });
  add({ partId: "brick-2x2", colorId: c.body, x: 4, y: 3, z: 1, rot: 0, component: "body", step: 3 });
  add({ partId: "brick-2x2", colorId: c.body, x: 4, y: 3, z: 3, rot: 0, component: "body", step: 3 });
  add({ partId: "brick-2x4", colorId: c.body, x: 6, y: 3, z: 1, rot: 90, component: "body", step: 3 });
  add({ partId: "brick-2x4", colorId: c.body, x: 8, y: 3, z: 1, rot: 90, component: "body", step: 3 });

  // Step 4: second layer (y=6), staggered over the body joints; windshield at the front.
  add({ partId: "brick-2x2", colorId: c.body, x: 0, y: 6, z: 1, rot: 0, component: "body", step: 4 });
  add({ partId: "brick-2x2", colorId: c.body, x: 0, y: 6, z: 3, rot: 0, component: "body", step: 4 });
  add({ partId: "brick-2x4", colorId: c.body, x: 2, y: 6, z: 1, rot: 0, component: "body", step: 4 });
  add({ partId: "brick-2x4", colorId: c.body, x: 2, y: 6, z: 3, rot: 0, component: "body", step: 4 });
  add({ partId: "brick-2x4", colorId: c.body, x: 6, y: 6, z: 1, rot: 90, component: "body", step: 4 });
  add({ partId: "brick-1x4", colorId: c.body, x: 8, y: 6, z: 1, rot: 90, component: "body", step: 4 });
  add({ partId: "brick-1x2-nt", colorId: c.windows, x: 9, y: 6, z: 1, rot: 90, component: "windows", step: 4 });
  add({ partId: "brick-1x2-nt", colorId: c.windows, x: 9, y: 6, z: 3, rot: 90, component: "windows", step: 4 });

  // Step 5: roof plates (y=9).
  add({ partId: "plate-4x6", colorId: c.body, x: 0, y: 9, z: 1, rot: 0, component: "body", step: 5 });
  add({ partId: "plate-4x4", colorId: c.body, x: 6, y: 9, z: 1, rot: 0, component: "body", step: 5 });

  // Step 6: ladder base and ladder.
  add({ partId: "brick-2x2", colorId: c.ladder, x: 2, y: 10, z: 2, rot: 0, component: "ladder", step: 6 });
  add({ partId: PLATE_2X_BY_LEN[params.ladderLength], colorId: c.ladder, x: 1, y: 13, z: 2, rot: 0, component: "ladder", step: 6 });

  const components: ComponentDef[] = [
    { id: "body", label: "Body", colorId: c.body, allowedColors: FIRETRUCK_COLOR_OPTIONS.body },
    { id: "chassis", label: "Chassis", colorId: c.chassis, allowedColors: FIRETRUCK_COLOR_OPTIONS.chassis },
    { id: "ladder", label: "Ladder", colorId: c.ladder, allowedColors: FIRETRUCK_COLOR_OPTIONS.ladder },
    { id: "windows", label: "Windows", colorId: c.windows, allowedColors: FIRETRUCK_COLOR_OPTIONS.windows },
  ];
  return {
    template: "firetruck",
    templateVersion: FIRETRUCK_VERSION,
    params: { template: "firetruck", ...params },
    parts,
    components,
    steps,
    structuralKey: `${FIRETRUCK_VERSION}:ladder${params.ladderLength}`,
  };
}
