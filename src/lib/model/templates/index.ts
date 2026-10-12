import type { DesignModel, DesignParams, TemplateId } from "../types";
import { buildHouse, HOUSE_DEFAULTS } from "./house";
import { buildFiretruck, FIRETRUCK_DEFAULTS } from "./firetruck";
import { buildCreature, CREATURE_DEFAULTS } from "./creature";

export interface TemplateInfo {
  id: TemplateId;
  name: string;
  description: string;
  /** Pilot maturity: the house workflow is the first completed path. */
  maturity: "primary" | "secondary";
  adjustable: string[];
}

export const TEMPLATES: TemplateInfo[] = [
  {
    id: "house",
    name: "Little House",
    description: "A cottage with a door, windows and a gable or flat roof. An original BrickLoop design.",
    maturity: "primary",
    adjustable: ["Width: 6, 8 or 10 studs", "Roof: gable or flat", "Colors: base, walls, windows, roof"],
  },
  {
    id: "firetruck",
    name: "Fire Truck",
    description: "A compact fire engine with an extending ladder. An original BrickLoop design.",
    maturity: "secondary",
    adjustable: ["Ladder length: 6, 8 or 10 studs", "Colors: body, chassis, ladder, windows"],
  },
  {
    id: "creature",
    name: "Caterpillar Creature",
    description: "A friendly segmented creature on little legs. An original BrickLoop design.",
    maturity: "secondary",
    adjustable: ["Body length: 2 to 5 segments", "Colors: body, head, spine, legs"],
  },
];

export function defaultParams(template: TemplateId): DesignParams {
  switch (template) {
    case "house":
      return { template, ...structuredClone(HOUSE_DEFAULTS) };
    case "firetruck":
      return { template, ...structuredClone(FIRETRUCK_DEFAULTS) };
    case "creature":
      return { template, ...structuredClone(CREATURE_DEFAULTS) };
  }
}

export function buildModel(params: DesignParams): DesignModel {
  switch (params.template) {
    case "house": {
      const { template: _t, ...p } = params;
      return buildHouse(p);
    }
    case "firetruck": {
      const { template: _t, ...p } = params;
      return buildFiretruck(p);
    }
    case "creature": {
      const { template: _t, ...p } = params;
      return buildCreature(p);
    }
  }
}

export function isTemplateId(v: unknown): v is TemplateId {
  return v === "house" || v === "firetruck" || v === "creature";
}
