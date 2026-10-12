import { grid, type LayerSpec } from "../kit";
import type { KitDef } from "./types";

/**
 * Ages 12+: a display bonsai (botanical-style display model): a glazed pot,
 * a twisting trunk and layered foliage pads, with optional blossoms.
 */
export const BONSAI: KitDef = {
  id: "bonsai",
  name: "Desk Bonsai",
  version: "1.0.0",
  ageBand: "12+",
  category: "Display: botanical",
  description: "A calm display piece for a desk or shelf: a twisting trunk with layered foliage pads in a low pot. Add blossoms for a cherry-tree look.",
  components: [
    { id: "leaves", label: "Leaves", default: "green", allowed: ["green", "dark-green", "lime", "bright-pink", "orange", "red"], synonyms: ["leaves", "leaf", "foliage", "canopy", "tree"] },
    { id: "blossoms", label: "Blossoms", default: "bright-pink", allowed: ["bright-pink", "white", "yellow", "red", "orange"], synonyms: ["blossoms", "blossom", "flowers", "flower"] },
    { id: "trunk", label: "Trunk", default: "reddish-brown", allowed: ["reddish-brown", "dark-bluish-gray", "tan", "black"], synonyms: ["trunk", "branches", "branch", "wood"] },
    { id: "pot", label: "Pot", default: "dark-bluish-gray", allowed: ["dark-bluish-gray", "blue", "white", "black", "tan", "reddish-brown"], synonyms: ["pot", "planter", "base"] },
  ],
  options: [
    { id: "blossoms", label: "Blossoms", values: [{ id: "yes", label: "In bloom", synonyms: ["blossoms", "bloom", "flowers", "cherry"] }, { id: "no", label: "Evergreen", synonyms: ["evergreen", "no blossoms", "no flowers"] }], default: "no", synonyms: ["blossoms", "flowers", "bloom"] },
  ],
  blueprint(o) {
    const W = 14, D = 10;
    const ell = (x: number, z: number, cx: number, cz: number, rx: number, rz: number) => ((x + 0.5 - cx) / rx) ** 2 + ((z + 0.5 - cz) / rz) ** 2 <= 1;
    const pot = (x: number, z: number) => x >= 3 && x <= 10 && z >= 2 && z <= 7;
    const trunkAt = (x: number, z: number, x0: number) => x >= x0 && x <= x0 + 1 && z >= 4 && z <= 5;
    const bloom = o.blossoms === "yes";
    // Pads: [cx, cz, rx, rz] in stud units; each pad is two plate layers plus a textured top.
    const padL = [4, 5, 2.8, 2.4] as const;
    const padR = [9.5, 5, 3, 2.4] as const;
    const padT = [7, 5, 3, 2.5] as const;
    const pad = (p: readonly number[], shrink = 0) => (x: number, z: number) => ell(x, z, p[0], p[1], p[2] - shrink, p[3] - shrink);
    const dots = (p: readonly number[], x: number, z: number, shrink: number) => pad(p, shrink)(x, z) && (x + 2 * z) % 3 === 0;
    const layers: LayerSpec[] = [
      { kind: "plate", step: "Pot", rows: grid(W, D, (x, z) => (x >= 4 && x <= 9 && z >= 3 && z <= 6 ? "P" : ".")) },
      { kind: "brick", rows: grid(W, D, (x, z) => (pot(x, z) ? "P" : ".")) },
      { kind: "plate", step: "Soil and trunk", rows: grid(W, D, (x, z) => (pot(x, z) ? (z === 2 || z === 7 || x === 3 || x === 10 ? "P" : trunkAt(x, z, 5) ? "T" : "s") : ".")) },
      { kind: "brick", rows: grid(W, D, (x, z) => (trunkAt(x, z, 5) ? "T" : ".")) },
      { kind: "brick", rows: grid(W, D, (x, z) => (trunkAt(x, z, 6) ? "T" : ".")) },
      { kind: "plate", step: "Branches", rows: grid(W, D, (x, z) => (x >= 2 && x <= 11 && z >= 4 && z <= 5 ? "T" : ".")) },
      { kind: "plate", step: "Lower foliage", note: "Each pad is built from overlapping plates.", rows: grid(W, D, (x, z) => (pad(padL, 0.5)(x, z) || pad(padR, 0.5)(x, z) ? "L" : trunkAt(x, z, 6) ? "T" : ".")) },
      { kind: "plate", rows: grid(W, D, (x, z) => (pad(padL)(x, z) || pad(padR)(x, z) ? "L" : trunkAt(x, z, 6) ? "T" : ".")) },
      {
        kind: "brick",
        step: "Upper trunk",
        rows: grid(W, D, (x, z) => (trunkAt(x, z, 6) ? "T" : bloom ? (dots(padL, x, z, 1.4) || dots(padR, x, z, 1.4) ? "B" : ".") : dots(padL, x, z, 1.4) || dots(padR, x, z, 1.4) ? "o" : ".")),
      },
      { kind: "brick", rows: grid(W, D, (x, z) => (trunkAt(x, z, 7) ? "T" : ".")) },
      { kind: "plate", step: "Crown", rows: grid(W, D, (x, z) => (pad(padT, 0.8)(x, z) ? "L" : ".")) },
      { kind: "plate", rows: grid(W, D, (x, z) => (pad(padT)(x, z) ? "L" : ".")) },
      { kind: "plate", rows: grid(W, D, (x, z) => (pad(padT, 1.5)(x, z) ? (bloom && (x + z) % 2 === 0 ? "b" : "o") : ".")) },
    ];
    return {
      legend: {
        P: { component: "pot" },
        s: { color: "reddish-brown", group: "soil", kind: "tile" },
        T: { component: "trunk" },
        L: { component: "leaves" },
        o: { component: "leaves", parts: ["plate-round-1x1"] },
        b: { component: "blossoms", parts: ["plate-round-1x1"] },
        B: { component: "blossoms", parts: ["plate-round-1x1"] },
      },
      layers,
    };
  },
};
