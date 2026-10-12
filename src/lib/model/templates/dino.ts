import { profileLayers, span, type ProfileLine } from "../kit";
import type { KitDef } from "./types";

/**
 * Ages 7+: a brick-built dinosaur (Creator-style animal), authored as a side
 * profile. Faces right (+x). Body 8 wide (z 0..7), legs 3 wide each side.
 */
export const DINO: KitDef = {
  id: "dino",
  name: "Rexi the Dinosaur",
  version: "3.0.0",
  ageBand: "7+",
  category: "Brick-built animal",
  description: "A big two-legged dinosaur with a long tail, little arms, back spines and a jaw that builds open (roaring) or closed.",
  components: [
    { id: "skin", label: "Skin", default: "green", allowed: ["green", "dark-bluish-gray", "orange", "red", "blue", "reddish-brown", "lime"], synonyms: ["skin", "body", "dino", "dinosaur", "scales"] },
    { id: "spines", label: "Spines", default: "lime", allowed: ["lime", "orange", "yellow", "red", "tan", "dark-bluish-gray"], synonyms: ["spines", "spikes", "back", "plates"] },
    { id: "eyes", label: "Eyes", default: "yellow", allowed: ["yellow", "orange", "red", "lime", "white"], synonyms: ["eyes", "eye"] },
  ],
  options: [
    { id: "spines", label: "Back spines", values: [{ id: "yes", label: "Spines", synonyms: ["spines", "spikes"] }, { id: "no", label: "Smooth", synonyms: ["smooth", "no spines"] }], default: "yes", synonyms: ["spines", "spikes"] },
    { id: "jaw", label: "Jaw", values: [{ id: "open", label: "Roaring", synonyms: ["open", "roar", "roaring"] }, { id: "closed", label: "Closed", synonyms: ["closed", "close", "shut"] }], default: "open", synonyms: ["jaw", "mouth"] },
  ],
  blueprint(o) {
    const W = 24, D = 8;
    const open = o.jaw === "open";
    const lines: ProfileLine[] = [
      { kind: "brick", step: "Feet", note: "The tail end is on the left; the head will face right.", profile: ".........FFFFFF" },
      { kind: "brick", step: "Legs", profile: "..........LLL" },
      { kind: "brick", profile: "..........LLL" },
      { kind: "brick", profile: "..........LLL" },
      { kind: "brick", step: "Hips", note: "Long bricks run across both legs to lock them together.", profile: ".........BBBBB" },
      { kind: "brick", step: "Body and tail", profile: "....TTBBBBBBBBBB" },
      { kind: "brick", profile: ".TTTTTBBBBBBBBBBBAA" },
      { kind: "brick", profile: "ttttTTBBBBBBBBBBBB" },
      { kind: "brick", step: o.spines === "yes" ? "Spines and shoulders" : "Shoulders", profile: (o.spines === "yes" ? "......SSSSSS" : "............") + "NNNNN" },
      { kind: "brick", step: "Neck", profile: ".............NNNNN" },
      { kind: "brick", step: "Lower jaw", profile: "..............JJJJJJJJ" },
      { kind: "brick", step: open ? "Teeth" : "Head", profile: open ? "..............HHHHWWWW" : "..............HHHHHHHH" },
      { kind: "brick", step: "Upper head and eyes", profile: "..............HHEHHHHHH" },
      { kind: "plate", step: "Top of the head", profile: "..............HHHHHHHH" },
      { kind: "plate", profile: "..............HHHHH" },
    ];
    return {
      legend: {
        g: { component: "skin" },
        r: { component: "spines", ridge: "x" },
        e: { component: "eyes", parts: ["brick-round-1x1"] },
        w: { color: "white", group: "teeth", parts: ["brick-1x1"] },
        m: { color: "dark-bluish-gray", group: "mouth", kind: "plate" },
      },
      layers: profileLayers(W, D, lines, {
        F: (_x, z) => (z <= 2 || z >= 5 ? "g" : "."),
        L: (_x, z) => (z <= 2 || z >= 5 ? "g" : "."),
        B: span(0, 7, "g"),
        T: span(2, 5, "g"),
        t: span(3, 4, "g"),
        A: (_x, z) => (z === 1 || z === 6 ? "g" : "."),
        N: span(1, 6, "g"),
        S: span(3, 4, "r"),
        J: span(1, 6, "g"),
        H: span(1, 6, "g"),
        E: (_x, z) => (z === 1 || z === 6 ? "e" : z >= 2 && z <= 5 ? "g" : "."),
        W: (x, z) => ((z === 1 || z === 6) && x % 2 === 0 ? "w" : z >= 2 && z <= 5 ? "m" : "."),
      }),
    };
  },
};
