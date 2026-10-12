import { grid } from "../kit";
import type { KitDef } from "./types";

/**
 * Ages 4+: a chunky, quick build with big bricks (Classic/Juniors-style animal).
 * Puppy faces right (+x). Body 4 studs wide (z 0..3).
 */
export const PUP: KitDef = {
  id: "pup",
  name: "Patch the Puppy",
  version: "1.0.0",
  ageBand: "4+",
  category: "First builds: chunky animal",
  description: "A friendly puppy with a wagging tail. Big bricks and a few short steps, made for first-time builders.",
  components: [
    { id: "coat", label: "Coat", default: "tan", allowed: ["tan", "white", "reddish-brown", "light-bluish-gray", "orange", "black"], synonyms: ["body", "fur", "dog", "puppy"] },
    { id: "patches", label: "Ears & patches", default: "reddish-brown", allowed: ["reddish-brown", "black", "white", "tan", "dark-bluish-gray", "orange"], synonyms: ["ears", "ear", "spots", "patch", "tail"] },
    { id: "collar", label: "Collar", default: "red", allowed: ["red", "blue", "green", "yellow", "lime"], synonyms: ["collar", "neck"] },
  ],
  options: [
    { id: "spots", label: "Spots", values: [{ id: "yes", label: "Spotted", synonyms: ["spots", "spotted"] }, { id: "no", label: "Plain", synonyms: ["plain", "no spots"] }], default: "yes" },
    { id: "ears", label: "Ears", values: [{ id: "floppy", label: "Floppy", synonyms: ["floppy", "droopy"] }, { id: "perky", label: "Perky", synonyms: ["perky", "pointy", "up"] }], default: "floppy" },
  ],
  blueprint(o) {
    const W = 11, D = 4;
    const spotA = (x: number, z: number) => o.spots === "yes" && ((x >= 3 && x <= 4 && z === 0) || (x >= 5 && x <= 6 && z === 3));
    const spotB = (x: number, z: number) => o.spots === "yes" && ((x >= 2 && x <= 3 && z === 3) || (x >= 4 && x <= 5 && z === 0));
    const legs = grid(W, D, (x, z) => ((x === 2 || x === 3 || x === 6 || x === 7) && (z === 0 || z === 3) ? "c" : "."));
    return {
      legend: {
        c: { component: "coat" },
        p: { component: "patches" },
        k: { component: "collar" },
        e: { color: "black", group: "face" },
      },
      layers: [
        { kind: "brick", step: "Legs", note: "The head end is on the right.", rows: legs },
        { kind: "brick", rows: legs },
        { kind: "brick", step: "Body", rows: grid(W, D, (x, z) => (x >= 1 && x <= 8 ? (spotA(x, z) ? "p" : "c") : ".")) },
        { kind: "brick", rows: grid(W, D, (x, z) => (x >= 1 && x <= 8 ? (spotB(x, z) ? "p" : "c") : ".")) },
        {
          kind: "brick",
          step: "Collar, head and tail",
          rows: grid(W, D, (x, z) => (x === 6 ? "k" : x >= 7 && x <= 9 ? "c" : x === 10 && (z === 1 || z === 2) ? "c" : x >= 1 && x <= 2 && (z === 1 || z === 2) ? "p" : ".")),
        },
        {
          kind: "brick",
          rows: grid(W, D, (x, z) => (x >= 6 && x <= 8 ? "c" : x === 9 && (z === 1 || z === 2) ? "e" : x === 9 ? "c" : x === 10 && (z === 1 || z === 2) ? "e" : x >= 0 && x <= 1 && (z === 1 || z === 2) ? "p" : ".")),
        },
        {
          kind: "plate",
          step: "Ears",
          rows: grid(W, D, (x, z) => (x >= 6 && x <= 9 ? ((z === 0 || z === 3) && x >= 6 && x <= 7 ? "p" : "c") : ".")),
        },
        ...(o.ears === "perky"
          ? [{ kind: "brick" as const, rows: grid(W, D, (x, z) => (x === 7 && (z === 0 || z === 3) ? "p" : ".")) }]
          : [{ kind: "plate" as const, rows: grid(W, D, (x, z) => (x >= 6 && x <= 7 && (z === 0 || z === 3) ? "p" : ".")) }]),
      ],
    };
  },
};
