import { grid, type LayerSpec } from "../kit";
import type { KitDef } from "./types";

/**
 * Ages 8+: a detailed little house (Creator-style building) with a front garden,
 * door, windows, overhanging gable roof and optional chimney.
 * Front of the house faces -z; the garden is at z 0..2.
 */
export const COTTAGE: KitDef = {
  id: "cottage",
  name: "Cozy Cottage",
  version: "2.0.0",
  ageBand: "8+",
  category: "Buildings: family house",
  description: "A cottage with a front garden, flower beds, a path to the door, windows on every side and an overhanging gable roof.",
  components: [
    { id: "walls", label: "Walls", default: "white", allowed: ["white", "tan", "yellow", "light-bluish-gray", "red", "blue"], synonyms: ["walls", "wall", "house", "bricks"] },
    { id: "roof", label: "Roof", default: "red", allowed: ["red", "dark-bluish-gray", "reddish-brown", "black", "blue", "green"], synonyms: ["roof", "rooftop", "tiles"] },
    { id: "door", label: "Door", default: "reddish-brown", allowed: ["reddish-brown", "red", "blue", "green", "yellow", "black"], synonyms: ["door"] },
    { id: "garden", label: "Garden", default: "green", allowed: ["green", "lime", "tan", "dark-bluish-gray"], synonyms: ["garden", "grass", "base", "ground", "lawn"] },
    { id: "chimney", label: "Chimney", default: "dark-bluish-gray", allowed: ["dark-bluish-gray", "red", "reddish-brown", "light-bluish-gray", "white"], synonyms: ["chimney"] },
    { id: "windows", label: "Windows", default: "trans-clear", allowed: ["trans-clear", "trans-light-blue"], synonyms: ["windows", "window", "glass"] },
  ],
  options: [
    { id: "size", label: "Size", values: [{ id: "cozy", label: "Cozy (12 studs)", synonyms: ["small", "cozy"] }, { id: "roomy", label: "Roomy (16 studs)", synonyms: ["large", "big", "roomy"] }], default: "cozy", ordered: true, synonyms: ["size", "width", "wide", "wider", "bigger", "smaller"] },
    { id: "chimney", label: "Chimney", values: [{ id: "yes", label: "Chimney", synonyms: ["chimney"] }, { id: "no", label: "No chimney", synonyms: ["no chimney"] }], default: "yes", synonyms: ["chimney"] },
  ],
  blueprint(o) {
    const W = o.size === "roomy" ? 16 : 12;
    const D = 10;
    const c = W / 2; // door at x c-1..c
    const zF = 3, zB = 8; // house front and back walls
    const inBody = (x: number, z: number) => x >= 1 && x <= W - 2 && z >= zF && z <= zB;
    const isWall = (x: number, z: number) => inBody(x, z) && (x === 1 || x === W - 2 || z === zF || z === zB);
    const frontWindows = W === 16 ? [3, 4, 11, 12] : [2, 3, 8, 9];
    const chim = o.chimney === "yes";
    const chimX = (x: number) => x >= W - 4 && x <= W - 3;

    const wallCourse = (k: number) =>
      grid(W, D, (x, z) => {
        if (k === 1 && !inBody(x, z)) {
          // Front garden: path to the door, flowers and bushes.
          if (z <= 2 && (x === c - 1 || x === c)) return "p";
          if (z === 1 && (x === 1 || x === 3 || x === W - 4 || x === W - 2)) return "f";
          if (z === 1 && (x === 2 || x === W - 3)) return "y";
          if (z === 2 && (x === 0 || x === W - 1)) return "u";
          return ".";
        }
        if (!isWall(x, z)) return ".";
        if (z === zF && (x === c - 1 || x === c) && k <= 3) return "d";
        if ((k === 2 || k === 3) && z === zF && frontWindows.includes(x)) return "w";
        if ((k === 2 || k === 3) && (x === 1 || x === W - 2) && (z === 5 || z === 6)) return "w";
        if ((k === 2 || k === 3) && z === zB && (x === c - 1 || x === c)) return "w";
        return "a";
      });

    // Gable roof over z 2..9 (overhang 1 on every side): four courses closing in to a ridge.
    const roofCourse = (k: number) =>
      grid(W, D, (x, z) => {
        if (z < 2) return ".";
        if (chim && chimX(x)) {
          if (z === 5 || z === 6) return "c";
          if (k >= 2 && (z === 4 || z === 7)) return "R";
          if (k >= 3) return ".";
        }
        if (k === 0) return z <= 3 ? "F" : z >= 8 ? "K" : "R";
        if (k === 1) return z === 3 || z === 4 ? "F" : z === 7 || z === 8 ? "K" : z === 5 || z === 6 ? "R" : ".";
        if (k === 2) return z === 4 || z === 5 ? "F" : z === 6 || z === 7 ? "K" : ".";
        return z === 5 || z === 6 ? "X" : ".";
      });

    const layers: LayerSpec[] = [
      { kind: "plate", step: "Base", note: "The long side with the path faces you.", rows: grid(W, D, () => "g") },
      { kind: "brick", step: "Garden and first course", rows: wallCourse(1) },
      { kind: "brick", step: "Walls", rows: wallCourse(2) },
      { kind: "brick", rows: wallCourse(3) },
      { kind: "brick", step: "Walls above the door", rows: wallCourse(4) },
      { kind: "brick", rows: wallCourse(5) },
      { kind: "plate", step: "Ceiling", note: "The ceiling overhangs one stud on every side.", rows: grid(W, D, (_x, z) => (z >= 2 ? "r" : ".")) },
      { kind: "brick", step: "Roof", rows: roofCourse(0) },
      { kind: "brick", rows: roofCourse(1) },
      { kind: "brick", rows: roofCourse(2) },
      { kind: "brick", step: "Ridge", rows: roofCourse(3) },
    ];
    if (chim) layers.push({ kind: "brick", step: "Chimney top", rows: grid(W, D, (x, z) => (chimX(x) && (z === 5 || z === 6) ? "c" : ".")) });
    return {
      legend: {
        g: { component: "garden" },
        a: { component: "walls" },
        d: { component: "door" },
        w: { component: "windows", parts: ["brick-1x2-nt"] },
        p: { color: "tan", group: "path", kind: "tile" },
        f: { color: "red", group: "flowers", parts: ["plate-round-1x1"] },
        y: { color: "yellow", group: "flowers", parts: ["plate-round-1x1"] },
        u: { color: "green", group: "bushes", parts: ["brick-round-1x1"] },
        r: { component: "roof" },
        R: { component: "roof" },
        F: { component: "roof", slope: "front" },
        K: { component: "roof", slope: "back" },
        X: { component: "roof", ridge: "x" },
        c: { component: "chimney" },
      },
      layers,
    };
  },
};
