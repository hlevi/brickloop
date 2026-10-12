import type { ColorId } from "../../catalog/colors";
import { PLATE_2X_BY_LEN } from "../../catalog/parts";
import type { BuildStep, ComponentDef, CreatureParams, DesignModel, PlacedPart } from "../types";

export const CREATURE_VERSION = "creature-1.0.0";
export const CREATURE_LENGTHS = [2, 3, 4, 5] as const;

export const CREATURE_COLOR_OPTIONS: Record<keyof CreatureParams["colors"], ColorId[]> = {
  body: ["lime", "green", "orange", "yellow", "blue", "red"],
  head: ["green", "lime", "orange", "yellow", "blue", "red"],
  spine: ["orange", "yellow", "red", "dark-bluish-gray", "green"],
  legs: ["dark-bluish-gray", "black", "green", "reddish-brown"],
};

export const CREATURE_DEFAULTS: CreatureParams = {
  bodyLength: 3,
  colors: { body: "lime", head: "green", spine: "orange", legs: "dark-bluish-gray" },
};

/** A caterpillar-like creature running along +x, head at x = 0..1. */
export function buildCreature(params: CreatureParams): DesignModel {
  const c = params.colors;
  const segs = params.bodyLength;
  const parts: PlacedPart[] = [];
  let n = 0;
  const add = (p: Omit<PlacedPart, "uid">) => parts.push({ uid: `p${++n}`, ...p });
  const steps: BuildStep[] = [
    { index: 1, title: "Legs", note: "Stand the legs two studs apart. The head end is on the left." },
    { index: 2, title: "Head and body segments" },
    { index: 3, title: "Spine", note: "The spine locks the head and all body segments together." },
    { index: 4, title: "Eyes" },
  ];
  // One 1x2 leg pair under the head and under every body segment.
  for (let i = 0; i <= segs; i++) {
    add({ partId: "brick-1x2", colorId: c.legs, x: 2 * i + 1, y: 0, z: 0, rot: 90, component: "legs", step: 1 });
  }
  add({ partId: "brick-2x2", colorId: c.head, x: 0, y: 3, z: 0, rot: 0, component: "head", step: 2 });
  for (let i = 0; i < segs; i++) {
    add({ partId: "brick-2x2", colorId: c.body, x: 2 + 2 * i, y: 3, z: 0, rot: 0, component: "body", step: 2 });
  }
  const spineLen = 2 * (segs + 1);
  add({ partId: PLATE_2X_BY_LEN[spineLen], colorId: c.spine, x: 0, y: 6, z: 0, rot: 0, component: "spine", step: 3 });
  add({ partId: "plate-round-1x1", colorId: "white", x: 0, y: 7, z: 0, rot: 0, component: "eyes", step: 4 });
  add({ partId: "plate-round-1x1", colorId: "white", x: 0, y: 7, z: 1, rot: 0, component: "eyes", step: 4 });
  add({ partId: "plate-round-1x1", colorId: "black", x: 0, y: 8, z: 0, rot: 0, component: "eyes", step: 4 });
  add({ partId: "plate-round-1x1", colorId: "black", x: 0, y: 8, z: 1, rot: 0, component: "eyes", step: 4 });

  const components: ComponentDef[] = [
    { id: "body", label: "Body", colorId: c.body, allowedColors: CREATURE_COLOR_OPTIONS.body },
    { id: "head", label: "Head", colorId: c.head, allowedColors: CREATURE_COLOR_OPTIONS.head },
    { id: "spine", label: "Spine", colorId: c.spine, allowedColors: CREATURE_COLOR_OPTIONS.spine },
    { id: "legs", label: "Legs", colorId: c.legs, allowedColors: CREATURE_COLOR_OPTIONS.legs },
  ];
  return {
    template: "creature",
    templateVersion: CREATURE_VERSION,
    params: { template: "creature", ...params },
    parts,
    components,
    steps,
    structuralKey: `${CREATURE_VERSION}:len${segs}`,
  };
}
