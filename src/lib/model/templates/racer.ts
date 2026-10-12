import { grid } from "../kit";
import type { KitDef } from "./types";

/**
 * Ages 6+: a race car with free-rolling wheels (City/Speed-style vehicle).
 * The car points right (+x); body is 4 wide (z 1..4), wheels sit outside at z 0 and z 5.
 */
export const RACER: KitDef = {
  id: "racer",
  name: "Turbo Racer",
  version: "1.0.0",
  ageBand: "6+",
  category: "Vehicles: race car",
  description: "A low race car with rolling wheels, a driver's helmet, headlights and an optional rear wing.",
  components: [
    { id: "body", label: "Body", default: "red", allowed: ["red", "blue", "yellow", "lime", "orange", "white", "black", "green"], synonyms: ["body", "car", "paint"] },
    { id: "stripes", label: "Stripes & wing", default: "white", allowed: ["white", "black", "yellow", "red", "blue", "orange"], synonyms: ["stripe", "stripes", "wing", "spoiler", "accent"] },
    { id: "chassis", label: "Chassis", default: "dark-bluish-gray", allowed: ["dark-bluish-gray", "black", "light-bluish-gray"], synonyms: ["chassis", "frame", "underside"] },
    { id: "helmet", label: "Helmet", default: "yellow", allowed: ["yellow", "white", "blue", "red", "orange", "lime", "black"], synonyms: ["helmet", "driver"] },
    { id: "windscreen", label: "Windscreen", default: "trans-clear", allowed: ["trans-clear", "trans-light-blue"], synonyms: ["windscreen", "windshield", "window", "glass"] },
  ],
  options: [
    { id: "wing", label: "Rear wing", values: [{ id: "yes", label: "Wing", synonyms: ["wing", "spoiler"] }, { id: "no", label: "No wing", synonyms: ["no wing", "no spoiler"] }], default: "yes", synonyms: ["wing", "spoiler"] },
    { id: "length", label: "Length", values: [{ id: "short", label: "Short" }, { id: "long", label: "Long" }], default: "long", ordered: true, synonyms: ["length", "longer", "shorter"] },
  ],
  blueprint(o) {
    const L = o.length === "short" ? 10 : 12;
    const W = L, D = 6;
    const nose = L - 2;
    const rear = [1, L - 4];
    const inBody = (x: number, z: number) => x >= 0 && x < L && z >= 1 && z <= 4;
    return {
      baseY: 2,
      preSteps: [{ title: "Wheels", note: "Push a wheel onto each holder pin. The front of the car points right." }],
      legend: {
        d: { component: "chassis" },
        b: { component: "body" },
        s: { component: "stripes" },
        n: { component: "body", slope: "right" },
        w: { component: "windscreen", slope: "right" },
        h: { component: "helmet", parts: ["brick-round-2x2"] },
        l: { color: "trans-clear", parts: ["brick-round-1x1"], group: "lights" },
        t: { component: "stripes" },
        q: { component: "stripes", parts: ["brick-round-1x1"] },
        S: { component: "stripes", kind: "tile" },
        T: { component: "body", kind: "tile" },
      },
      layers: [
        { kind: "plate", step: "Chassis", rows: grid(W, D, (x, z) => (inBody(x, z) ? "d" : ".")) },
        {
          kind: "brick",
          step: "Body",
          note: "White stripes run along both sides.",
          rows: grid(W, D, (x, z) => (!inBody(x, z) ? "." : x === L - 1 && (z === 1 || z === 4) ? "l" : z === 1 || z === 4 ? (x >= 1 && x <= L - 3 ? "s" : "b") : "b")),
        },
        {
          kind: "brick",
          step: "Nose, cockpit and deck",
          note: "Smooth tiles make the deck; the slopes form the nose.",
          rows: grid(W, D, (x, z) => {
            if (!inBody(x, z)) return ".";
            if (x >= nose) return "n";
            if (x >= nose - 2 && z >= 2 && z <= 3) return "w";
            if (x >= nose - 4 && x < nose - 2 && z >= 2 && z <= 3) return "h";
            if (o.wing === "yes" && x === 0 && (z === 1 || z === 4)) return "q";
            if (z >= 2 && z <= 3 && x < nose - 4) return "S";
            return "T";
          }),
        },
        ...(o.wing === "yes"
          ? [{ kind: "plate" as const, step: "Rear wing", rows: grid(W, D, (x) => (x <= 1 ? "t" : ".")) }]
          : []),
      ],
      extras: [
        { partId: "plate-2x2-wheel-holder", color: "black", x: rear[0], y: 1, z: 2, step: "Wheels" },
        { partId: "wheel-8x6", color: "light-bluish-gray", x: rear[0], y: 0, z: 0, attachTo: 0, step: "Wheels" },
        { partId: "wheel-8x6", color: "light-bluish-gray", x: rear[0], y: 0, z: 5, attachTo: 0, step: "Wheels" },
        { partId: "plate-2x2-wheel-holder", color: "black", x: rear[1], y: 1, z: 2, step: "Wheels" },
        { partId: "wheel-8x6", color: "light-bluish-gray", x: rear[1], y: 0, z: 0, attachTo: 3, step: "Wheels" },
        { partId: "wheel-8x6", color: "light-bluish-gray", x: rear[1], y: 0, z: 5, attachTo: 3, step: "Wheels" },
      ],
    };
  },
};
