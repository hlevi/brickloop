/**
 * Creature Lab kit: a socketed module grammar compiled by the regular kit compiler.
 *
 * A creature faces +x inside a 26 x 12 frame. The body occupies z 3..8; z = 0 is
 * the compiler's FRONT row, so the creature's sides face the viewer. Each slot
 * (body, legs, head, eyes, tail, back, top) contributes cells to named voxel
 * layers. put() throws on any overlap or out-of-bounds cell, and the exhaustive
 * test compiles and validates every combination, so a clashing module can never
 * reach a child.
 *
 * Any change to a module must bump `version`, so frozen orders keep their key.
 */
import type { ColorId } from "../../catalog/colors";
import type { Blueprint, ExtraPart, LayerKind, LayerSpec, LegendEntry } from "../kit";
import type { KitDef } from "./types";

const W = 26;
const D = 12;
type Put = (layer: string, x: number, z: number, ch: string) => void;

interface Frame {
  x0: number;
  x1: number;
}

const BODIES: Record<string, { x0: number; x1: number; h: number }> = {
  chunky: { x0: 9, x1: 16, h: 2 },
  long: { x0: 7, x1: 18, h: 2 },
  tall: { x0: 9, x1: 16, h: 3 },
};

interface Legs {
  kind: "bricks" | "wheels";
  layers: number;
  draw(put: Put, f: Frame): void;
  extras?(f: Frame): ExtraPart[];
}

const LEGS: Record<string, Legs> = {
  stompers: {
    kind: "bricks",
    layers: 3,
    draw(put, f) {
      const long = f.x1 - f.x0 + 1 > 8;
      const centers = long ? [f.x0 + 2, f.x1 - 2] : [Math.floor((f.x0 + f.x1) / 2)];
      for (const cx of centers)
        for (const z of [3, 4, 7, 8]) {
          for (let x = cx - 2; x <= cx + 2; x++) put("L0", x, z, "f");
          for (let x = cx - 1; x <= cx + 1; x++) {
            put("L1", x, z, "g");
            put("L2", x, z, "g");
          }
        }
    },
  },
  paws: {
    kind: "bricks",
    layers: 2,
    draw(put, f) {
      const long = f.x1 - f.x0 + 1 > 8;
      const groups = long
        ? [
            [f.x0 + 1, f.x0 + 2, f.x0 + 3],
            [f.x1 - 3, f.x1 - 2, f.x1 - 1],
          ]
        : [
            [f.x0 + 1, f.x0 + 2],
            [f.x1 - 2, f.x1 - 1],
          ];
      for (const xs of groups)
        for (const x of xs)
          for (const z of [3, 4, 7, 8]) {
            put("L0", x, z, "f");
            put("L1", x, z, "g");
          }
    },
  },
  wheels: {
    kind: "wheels",
    layers: 1,
    draw(put, f) {
      for (let x = f.x0; x <= f.x1; x++) for (let z = 4; z <= 7; z++) put("L0", x, z, "d");
    },
    extras(f) {
      const a = f.x0 + 1;
      const b = f.x1 - 2;
      return [
        { partId: "plate-2x2-wheel-holder", color: "black", x: a, y: 1, z: 5, step: "Wheels" },
        { partId: "wheel-8x6", color: "light-bluish-gray", x: a, y: 0, z: 3, attachTo: 0, step: "Wheels" },
        { partId: "wheel-8x6", color: "light-bluish-gray", x: a, y: 0, z: 8, attachTo: 0, step: "Wheels" },
        { partId: "plate-2x2-wheel-holder", color: "black", x: b, y: 1, z: 5, step: "Wheels" },
        { partId: "wheel-8x6", color: "light-bluish-gray", x: b, y: 0, z: 3, attachTo: 3, step: "Wheels" },
        { partId: "wheel-8x6", color: "light-bluish-gray", x: b, y: 0, z: 8, attachTo: 3, step: "Wheels" },
      ];
    },
  },
};

/** Anchor points a head offers to the eyes and top slots (laid out so they never overlap). */
interface Crown {
  horns: [number, number][];
  crest: [number, number];
  eyes2: [number, number][];
  eye1: [number, number];
}

interface Head {
  x0(f: Frame): number;
  draw(put: Put, f: Frame, little: boolean): void;
  crown(f: Frame): Crown;
}

const HEADS: Record<string, Head> = {
  chomper: {
    x0: (f) => f.x1 - 2,
    draw(put, f, little) {
      for (let x = f.x1 - 2; x <= f.x1 + 3; x++)
        for (let z = 4; z <= 7; z++) {
          put("T0", x, z, "g");
          put("T1", x, z, little && x === f.x1 + 1 && (z === 4 || z === 7) ? "e" : x >= f.x1 + 2 && (z === 5 || z === 6) ? "a" : "g");
          put("T2", x, z, "g");
        }
    },
    crown: (f) => ({ horns: [[f.x1 - 1, 4], [f.x1 - 1, 7]], crest: [f.x1 - 2, 2], eyes2: [[f.x1 + 1, 4], [f.x1 + 1, 6]], eye1: [f.x1 + 1, 5] }),
  },
  bug: {
    x0: (f) => f.x1 - 3,
    draw(put, f, little) {
      for (let x = f.x1 - 3; x <= f.x1; x++)
        for (let z = 3; z <= 8; z++) {
          put("T0", x, z, "g");
          put("T1", x, z, little && x === f.x1 && (z === 4 || z === 7) ? "e" : "g");
          put("T2", x, z, "g");
        }
    },
    crown: (f) => ({ horns: [[f.x1 - 3, 4], [f.x1 - 3, 7]], crest: [f.x1 - 3, 2], eyes2: [[f.x1 - 1, 3], [f.x1 - 1, 7]], eye1: [f.x1 - 1, 5] }),
  },
  beak: {
    x0: (f) => f.x1 - 2,
    draw(put, f, little) {
      for (let x = f.x1 - 2; x <= f.x1 + 1; x++)
        for (let z = 4; z <= 7; z++) {
          put("T0", x, z, "g");
          put("T1", x, z, little && x === f.x1 && (z === 4 || z === 7) ? "e" : "g");
          put("T2", x, z, "g");
        }
      for (let x = f.x1 + 2; x <= f.x1 + 3; x++)
        for (const z of [5, 6]) {
          put("T0", x, z, "g");
          put("T1", x, z, "k");
        }
    },
    crown: (f) => ({ horns: [[f.x1 - 1, 4], [f.x1 - 1, 7]], crest: [f.x1 - 2, 2], eyes2: [[f.x1, 4], [f.x1, 6]], eye1: [f.x1, 5] }),
  },
  robo: {
    x0: (f) => f.x1 - 3,
    draw(put, f) {
      for (let x = f.x1 - 3; x <= f.x1 + 2; x++)
        for (let z = 3; z <= 8; z++) {
          put("T0", x, z, "g");
          put("T1", x, z, x >= f.x1 + 1 ? "v" : "g");
          if (x <= f.x1) put("T2", x, z, "g");
        }
    },
    crown: (f) => ({ horns: [[f.x1 - 3, 3], [f.x1 - 3, 8]], crest: [f.x1 - 3, 2], eyes2: [[f.x1 - 1, 3], [f.x1 - 1, 7]], eye1: [f.x1 - 1, 5] }),
  },
};

const TAILS: Record<string, (put: Put, f: Frame) => void> = {
  none: () => {},
  stub: (put, f) => {
    for (let x = f.x0 - 2; x < f.x0; x++) for (const z of [5, 6]) put("B1", x, z, "g");
  },
  whip: (put, f) => {
    for (let x = f.x0 - 3; x < f.x0; x++) for (let z = 4; z <= 7; z++) put("B0", x, z, "g");
    for (let x = f.x0 - 6; x < f.x0; x++) for (const z of [5, 6]) put("B1", x, z, "g");
  },
};

const BACKS: Record<string, (put: Put, f: Frame, coreX: number) => void> = {
  none: () => {},
  spikes: (put, f, coreX) => {
    const len = Math.floor((coreX - f.x0) / 2) * 2;
    for (let x = coreX - len; x < coreX; x++) for (const z of [5, 6]) put("T0", x, z, "r");
  },
  wings: (put, f) => {
    for (let x = f.x0 + 1; x <= f.x0 + 2; x++) for (let z = 0; z <= 11; z++) put("T0", x, z, "w");
  },
  shell: (put, f, coreX) => {
    const len = Math.floor((coreX - f.x0) / 2) * 2;
    for (let x = coreX - len; x < coreX; x++) {
      for (const z of [3, 4]) put("T0", x, z, "sF");
      for (const z of [7, 8]) put("T0", x, z, "sB");
      for (const z of [5, 6]) put("T0", x, z, "g");
    }
  },
  jetpack: (put, f) => {
    for (const z of [3, 4, 7, 8]) for (const x of [f.x0, f.x0 + 1]) put("T0", x, z, "j");
  },
};

const TOPS: Record<string, (put: Put, c: Crown) => void> = {
  none: () => {},
  horns: (put, c) => {
    for (const [x, z] of c.horns) put("T3", x, z, "h");
  },
  crest: (put, c) => {
    const [x0, len] = c.crest;
    for (let x = x0; x < x0 + len; x++) for (const z of [5, 6]) put("T3", x, z, "R");
  },
};

const EYES: Record<string, (put: Put, c: Crown) => void> = {
  little: () => {},
  googly: (put, c) => {
    c.eyes2.forEach(([x, z], i) => {
      for (const dx of [0, 1]) for (const dz of [0, 1]) put("T3", x + dx, z + dz, "o");
      put("T4", x + 1, i === 0 ? z + 1 : z, "p");
    });
  },
  cyclops: (put, c) => {
    const [x, z] = c.eye1;
    for (const dx of [0, 1]) for (const dz of [0, 1]) put("T3", x + dx, z + dz, "o");
    put("T4", x + 1, z, "p");
  },
};

const LEGEND: Record<string, LegendEntry> = {
  g: { component: "skin" },
  f: { component: "feet" },
  d: { component: "feet" },
  a: { component: "belly" },
  e: { component: "eyes", parts: ["brick-round-1x1"] },
  k: { component: "belly", slope: "right" },
  v: { color: "trans-light-blue", group: "visor", slope: "right" },
  r: { component: "spikes", ridge: "x" },
  R: { component: "spikes", ridge: "x" },
  w: { component: "spikes", kind: "plate" },
  sF: { component: "spikes", slope: "front" },
  sB: { component: "spikes", slope: "back" },
  j: { component: "spikes", parts: ["brick-round-2x2"] },
  h: { component: "spikes", parts: ["brick-round-1x1"] },
  o: { component: "eyes", parts: ["brick-round-2x2"] },
  p: { color: "black", group: "pupils", parts: ["plate-round-1x1"] },
};

/** Step note placeholder replaced with the creature's name at build time. */
export const NAME_PLACEHOLDER = "{name}";
export const POWER_UP_STEP = "Power up!";

function creatureBlueprint(o: Record<string, string>): Blueprint {
  const b = BODIES[o.body];
  const legs = LEGS[o.legs];
  const head = HEADS[o.head];
  if (!b || !legs || !head || !EYES[o.eyes] || !TAILS[o.tail] || !BACKS[o.back] || !TOPS[o.crown]) throw new Error(`Unknown creature module in ${JSON.stringify(o)}`);
  const f: Frame = { x0: b.x0, x1: b.x1 };
  const plan: { id: string; kind: LayerKind; step?: string; note?: string }[] = [];
  if (legs.kind === "wheels") plan.push({ id: "L0", kind: "plate", step: "Chassis" });
  else
    for (let i = 0; i < legs.layers; i++)
      plan.push({ id: `L${i}`, kind: "brick", step: i === 0 ? "Feet" : i === 1 ? "Legs" : undefined, note: i === 0 ? "The head end points to the right." : undefined });
  for (let i = 0; i < b.h; i++) plan.push({ id: `B${i}`, kind: "brick", step: i === 0 ? "Body" : undefined });
  plan.push(
    { id: "T0", kind: "brick", step: "Head and back", note: "Leave the hole in the middle of the back empty: that's where the power core goes!" },
    { id: "T1", kind: "brick", step: "Face" },
    { id: "T2", kind: "plate", step: "Top of the head" },
    { id: "T3", kind: "brick", step: "Eyes and horns" },
    { id: "T4", kind: "plate" },
  );
  const vox = new Map<string, Map<string, string>>(plan.map((p) => [p.id, new Map()]));
  const put: Put = (layer, x, z, ch) => {
    const m = vox.get(layer);
    if (!m) throw new Error(`no layer ${layer}`);
    if (x < 0 || x >= W || z < 0 || z >= D) throw new Error(`out of bounds ${layer} ${x},${z}`);
    const k = `${x},${z}`;
    if (m.has(k)) throw new Error(`overlap ${layer} ${k}: ${m.get(k)} vs ${ch}`);
    m.set(k, ch);
  };
  // Body (top course of a tall body gets a belly stripe on both sides).
  for (let i = 0; i < b.h; i++)
    for (let x = b.x0; x <= b.x1; x++)
      for (let z = 3; z <= 8; z++) put(`B${i}`, x, z, i === b.h - 1 && i > 0 && (z === 3 || z === 8) && x > b.x0 && x < b.x1 ? "a" : "g");
  legs.draw(put, f);
  const headX0 = head.x0(f);
  head.draw(put, f, o.eyes === "little");
  // Reserve the power-core socket so no back module can cover it.
  const coreX = headX0 - 1;
  const coreZ = 5;
  put("T0", coreX, coreZ, "#");
  TAILS[o.tail](put, f);
  BACKS[o.back](put, f, coreX);
  EYES[o.eyes](put, head.crown(f));
  TOPS[o.crown](put, head.crown(f));
  vox.get("T0")!.delete(`${coreX},${coreZ}`);

  // Map multi-character legend ids to single characters for the compiler.
  const charOf: Record<string, string> = {};
  const legend: Record<string, LegendEntry> = {};
  const pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  Object.entries(LEGEND).forEach(([id, e], i) => {
    charOf[id] = pool[i];
    legend[pool[i]] = e;
  });
  const layers: LayerSpec[] = [];
  let pendingStep: string | undefined;
  let pendingNote: string | undefined;
  for (const p of plan) {
    const m = vox.get(p.id)!;
    if (p.step) {
      pendingStep = p.step;
      pendingNote = p.note;
    }
    if (m.size === 0) continue;
    const rows: string[] = [];
    for (let r = 0; r < D; r++) {
      const z = D - 1 - r;
      let s = "";
      for (let x = 0; x < W; x++) s += m.has(`${x},${z}`) ? charOf[m.get(`${x},${z}`)!] : ".";
      rows.push(s);
    }
    layers.push({ kind: p.kind, rows, step: pendingStep, note: pendingNote });
    pendingStep = undefined;
    pendingNote = undefined;
  }
  const baseY = legs.kind === "wheels" ? 2 : 0;
  let y = baseY;
  for (const p of plan) {
    if (p.id === "T0") break;
    if (vox.get(p.id)!.size) y += p.kind === "brick" ? 3 : 1;
  }
  const extras: ExtraPart[] = [...(legs.extras?.(f) ?? []), { partId: "brick-round-1x1", component: "core", x: coreX, y, z: coreZ, step: POWER_UP_STEP }];
  return {
    baseY,
    preSteps: legs.kind === "wheels" ? [{ title: "Wheels", note: "The head end points to the right." }] : undefined,
    extraSteps: [{ title: POWER_UP_STEP, note: `Make a wish, then click ${NAME_PLACEHOLDER}'s power core into place.` }],
    legend,
    layers,
    extras,
  };
}

const SKIN: ColorId[] = ["green", "lime", "orange", "red", "blue", "yellow", "bright-pink", "white", "light-bluish-gray", "dark-bluish-gray", "reddish-brown", "black"];

export const CREATURE: KitDef = {
  id: "creature",
  name: "Creature Lab",
  version: "1.0.0",
  ageBand: "6+",
  category: "Invent-your-own creature",
  description: "Snap together a creature of your own: body, legs or wheels, head, eyes, tail, back and top. Over 4,800 shapes, all buildable.",
  lab: true,
  components: [
    { id: "skin", label: "Skin", default: "green", allowed: SKIN, synonyms: ["skin", "body", "creature"] },
    { id: "belly", label: "Belly", default: "yellow", allowed: ["yellow", "white", "tan", "lime", "orange", "bright-pink", "light-bluish-gray", "blue"], synonyms: ["belly", "tummy", "mouth"] },
    { id: "feet", label: "Feet", default: "dark-bluish-gray", allowed: ["dark-bluish-gray", "black", "reddish-brown", "light-bluish-gray", "tan", "white", "orange"], synonyms: ["feet", "foot", "wheels"] },
    { id: "eyes", label: "Eyes", default: "white", allowed: ["white", "yellow", "lime", "orange", "bright-pink"], synonyms: ["eyes", "eye"] },
    { id: "spikes", label: "Spikes", default: "orange", allowed: ["orange", "red", "yellow", "lime", "blue", "dark-bluish-gray", "white", "bright-pink", "black", "green"], synonyms: ["spikes", "horns", "wings", "shell", "back"] },
    { id: "core", label: "Power core", default: "trans-light-blue", allowed: ["trans-red", "trans-yellow", "trans-green", "trans-light-blue", "trans-clear"], synonyms: ["core", "power"] },
  ],
  options: [
    {
      id: "body",
      label: "Body",
      tab: { label: "Body", icon: "🫃" },
      default: "chunky",
      values: [
        { id: "chunky", label: "Chunky", icon: "🥔" },
        { id: "long", label: "Long", icon: "🥖" },
        { id: "tall", label: "Tall", icon: "🗼" },
      ],
    },
    {
      id: "legs",
      label: "Legs",
      tab: { label: "Legs", icon: "🦵" },
      default: "stompers",
      values: [
        { id: "stompers", label: "Stompers", icon: "🦖" },
        { id: "paws", label: "Paws", icon: "🐾" },
        { id: "wheels", label: "Wheels", icon: "🛞" },
      ],
    },
    {
      id: "head",
      label: "Head",
      tab: { label: "Head", icon: "🐲" },
      default: "chomper",
      values: [
        { id: "chomper", label: "Chomper", icon: "🐊" },
        { id: "bug", label: "Bug", icon: "🐞" },
        { id: "beak", label: "Beak", icon: "🦜" },
        { id: "robo", label: "Robo", icon: "🤖" },
      ],
    },
    {
      id: "eyes",
      label: "Eyes",
      tab: { label: "Eyes", icon: "👀" },
      default: "googly",
      values: [
        { id: "googly", label: "Googly", icon: "👀" },
        { id: "cyclops", label: "Big eye", icon: "👁️" },
        { id: "little", label: "Little", icon: "•" },
      ],
    },
    {
      id: "tail",
      label: "Tail",
      tab: { label: "Tail", icon: "🦎" },
      default: "whip",
      values: [
        { id: "none", label: "No tail", icon: "⭕" },
        { id: "stub", label: "Stub", icon: "🐇" },
        { id: "whip", label: "Whip", icon: "🦎" },
      ],
    },
    {
      id: "back",
      label: "Back",
      tab: { label: "Back", icon: "🪽" },
      default: "spikes",
      values: [
        { id: "none", label: "Nothing", icon: "⭕" },
        { id: "spikes", label: "Spikes", icon: "🦔" },
        { id: "wings", label: "Wings", icon: "🪽" },
        { id: "shell", label: "Shell", icon: "🐢" },
        { id: "jetpack", label: "Jetpack", icon: "🚀" },
      ],
    },
    {
      id: "crown",
      label: "Top",
      tab: { label: "Top", icon: "👑" },
      default: "horns",
      values: [
        { id: "none", label: "Nothing", icon: "⭕" },
        { id: "horns", label: "Horns", icon: "🦄" },
        { id: "crest", label: "Crest", icon: "🦕" },
      ],
    },
  ],
  blueprint: creatureBlueprint,
};
