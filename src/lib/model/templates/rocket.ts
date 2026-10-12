import { grid, type LayerSpec } from "../kit";
import type { KitDef } from "./types";

/**
 * Ages 9+: a space rocket on its launch pad with a service tower (space/City-style).
 * Rocket body is 4x4 at x 4..7, z 4..7 on a 12x12 pad; tower at x 10..11, z 9..10.
 */
export const ROCKET: KitDef = {
  id: "rocket",
  name: "Skyward Rocket",
  version: "1.1.0",
  ageBand: "9+",
  category: "Space: rocket and launch pad",
  description: "A tall rocket with fins, engine bells and a nose cone, standing on a launch pad with a service tower and access arm.",
  components: [
    { id: "body", label: "Rocket body", default: "white", allowed: ["white", "light-bluish-gray", "yellow", "orange", "black"], synonyms: ["body", "rocket", "hull"] },
    { id: "accent", label: "Stripes & fins", default: "red", allowed: ["red", "blue", "orange", "black", "yellow", "dark-bluish-gray"], synonyms: ["stripes", "stripe", "fins", "fin", "accent", "nose"] },
    { id: "pad", label: "Launch pad", default: "dark-bluish-gray", allowed: ["dark-bluish-gray", "light-bluish-gray", "black"], synonyms: ["pad", "base", "ground", "launch pad"] },
    { id: "tower", label: "Tower", default: "light-bluish-gray", allowed: ["light-bluish-gray", "dark-bluish-gray", "yellow", "red", "orange"], synonyms: ["tower", "gantry", "arm"] },
    { id: "windows", label: "Windows", default: "trans-light-blue", allowed: ["trans-light-blue", "trans-clear"], synonyms: ["windows", "window", "porthole"] },
  ],
  options: [
    { id: "stages", label: "Stages", values: [{ id: "2", label: "2 stages" }, { id: "3", label: "3 stages" }], default: "2", ordered: true, synonyms: ["stages", "stage", "taller", "shorter", "bigger", "smaller", "height", "tall"] },
  ],
  blueprint(o) {
    const W = 12, D = 12;
    const stages = Number(o.stages) || 2;
    const body = (x: number, z: number) => x >= 4 && x <= 7 && z >= 4 && z <= 7;
    const tower = (x: number, z: number) => x >= 10 && x <= 11 && z >= 9 && z <= 10;
    const layers: LayerSpec[] = [
      { kind: "plate", step: "Launch pad", note: "The tower corner goes at the back right.", rows: grid(W, D, () => "g") },
      {
        kind: "brick",
        step: "Engines and fins",
        rows: grid(W, D, (x, z) => {
          if (body(x, z)) return "n";
          if (z >= 5 && z <= 6 && x >= 2 && x <= 3) return "<";
          if (z >= 5 && z <= 6 && x >= 8 && x <= 9) return ">";
          if (x >= 5 && x <= 6 && z >= 2 && z <= 3) return "v";
          if (x >= 5 && x <= 6 && z >= 8 && z <= 9) return "^";
          if (tower(x, z)) return "t";
          if ((x === 0 || x === W - 1) && (z === 0 || z === D - 1)) return "l";
          return ".";
        }),
      },
    ];
    let course = 0;
    for (let s = 1; s <= stages; s++) {
      for (let k = 0; k < 4; k++) {
        course++;
        const top = s === stages && k === 3;
        layers.push({
          kind: "brick",
          step: k === 0 ? `Stage ${s}` : undefined,
          rows: grid(W, D, (x, z) => {
            if (tower(x, z)) return "t";
            if (!body(x, z)) return ".";
            if (k === 0) return "a";
            if (top && z === 4 && (x === 5 || x === 6)) return "w";
            return "b";
          }),
        });
      }
      if (s < stages) {
        layers.push({
          kind: "plate",
          rows: grid(W, D, (x, z) => (body(x, z) || tower(x, z) ? "t" : ".")),
        });
      }
    }
    // Service arm: a plate ring around the top of the rocket reaching to the tower.
    layers.push({
      kind: "plate",
      step: "Service arm",
      rows: grid(W, D, (x, z) => (body(x, z) || tower(x, z) || (z >= 7 && z <= 8 && x >= 6 && x <= 11) ? "t" : ".")),
    });
    layers.push({ kind: "brick", step: "Nose cone", rows: grid(W, D, (x, z) => (body(x, z) ? (z <= 5 ? "F" : "K") : ".")) });
    layers.push({ kind: "brick", rows: grid(W, D, (x, z) => (x >= 5 && x <= 6 && z >= 5 && z <= 6 ? "c" : ".")) });
    layers.push({ kind: "brick", rows: grid(W, D, (x, z) => (x === 5 && z === 5 ? "o" : ".")) });
    layers.push({ kind: "plate", rows: grid(W, D, (x, z) => (x === 5 && z === 5 ? "q" : ".")) });
    return {
      legend: {
        g: { component: "pad" },
        n: { color: "dark-bluish-gray", group: "engines", parts: ["brick-round-2x2"] },
        "<": { component: "accent", slope: "left" },
        ">": { component: "accent", slope: "right" },
        v: { component: "accent", slope: "front" },
        "^": { component: "accent", slope: "back" },
        l: { color: "yellow", group: "pad lights", parts: ["brick-round-1x1"] },
        t: { component: "tower" },
        a: { component: "accent" },
        b: { component: "body" },
        w: { component: "windows", parts: ["brick-1x2-nt"] },
        F: { component: "body", slope: "front" },
        K: { component: "body", slope: "back" },
        c: { component: "accent", parts: ["brick-round-2x2"] },
        o: { component: "body", parts: ["brick-round-1x1"] },
        q: { component: "accent", parts: ["plate-round-1x1"] },
      },
      layers,
    };
  },
};
