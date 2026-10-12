import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { computeBom } from "@/lib/bom/bom";
import { partKey, revealOrder } from "@/lib/creature/anim";
import { creatureStats } from "@/lib/creature/stats";
import { ADJECTIVES, ANIMALS, ENDINGS, NUMBER_COUNT, POWERS, TITLES, WORDS, isValidIdentity, powerOf, renderBuilder, renderName } from "@/lib/creature/words";
import { WORLDS } from "@/lib/creature/worlds";
import { applyTool, toolDefinitions } from "@/lib/edit/tools";
import { buildModel, defaultParams, getKit, isLabKit } from "@/lib/model/templates";
import { POWER_UP_STEP } from "@/lib/model/templates/creature";
import type { DesignParams } from "@/lib/model/types";
import { estimatePrice, paymentFeeEstimate } from "@/lib/pricing/estimate";
import { validateModel } from "@/lib/validation/validate";

const kit = getKit("creature");
const slots = kit.options.map((o) => ({ id: o.id, values: o.values.map((v) => v.id) }));
const withOptions = (options: Record<string, string>): DesignParams => ({ ...defaultParams("creature"), options: { ...defaultParams("creature").options, ...options } });

/** Covering set: every module value on every body, plus every head x eyes x top. */
function coveringSet(): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const body of ["chunky", "long", "tall"])
    for (const s of slots) for (const v of s.values) out.push({ body, [s.id]: v });
  for (const head of ["chomper", "bug", "beak", "robo"]) for (const eyes of ["googly", "cyclops", "little"]) for (const crown of ["none", "horns", "crest"]) out.push({ head, eyes, crown });
  for (const legs of ["stompers", "paws", "wheels"]) for (const back of ["none", "spikes", "wings", "shell", "jetpack"]) for (const tail of ["none", "stub", "whip"]) out.push({ legs, back, tail, body: "long" });
  return out;
}

function seeded(n: number, seed = 42): Record<string, string>[] {
  let s = seed;
  const rnd = (m: number) => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s % m;
  };
  return Array.from({ length: n }, () => Object.fromEntries(slots.map((sl) => [sl.id, sl.values[rnd(sl.values.length)]])));
}

function allCombos(): Record<string, string>[] {
  let combos: Record<string, string>[] = [{}];
  for (const s of slots) combos = combos.flatMap((c) => s.values.map((v) => ({ ...c, [s.id]: v })));
  return combos;
}

function checkCombo(options: Record<string, string>) {
  const model = buildModel(withOptions(options));
  const v = validateModel(model);
  expect(v.errors, JSON.stringify(options)).toEqual([]);
  expect(v.warnings.filter((w) => w.code === "long_overhang"), JSON.stringify(options)).toEqual([]);
  const last = model.steps[model.steps.length - 1];
  expect(last.title).toBe(POWER_UP_STEP);
  const inLast = model.parts.filter((p) => p.step === last.index);
  expect(inLast).toHaveLength(1);
  expect(inLast[0]).toMatchObject({ partId: "brick-round-1x1", component: "core" });
  expect(model.steps.length).toBeGreaterThanOrEqual(7);
  expect(model.steps.length).toBeLessThanOrEqual(9);
  const st = creatureStats(model);
  for (const k of ["size", "zoom", "fly", "armor", "chomp"] as const) expect(Number.isInteger(st[k]) && st[k] >= 1 && st[k] <= 5).toBe(true);
  return model;
}

describe("creature kit", () => {
  it("is a lab kit with 4,860 combinations, hidden from the ready-made gallery", () => {
    expect(isLabKit("creature")).toBe(true);
    expect(allCombos()).toHaveLength(4860);
  });

  it("every combination in the covering set is valid and ends with the power core", () => {
    for (const o of coveringSet()) checkCombo(o);
  });

  it("a seeded random sample of 200 is valid", () => {
    for (const o of seeded(200)) checkCombo(o);
  });

  it.runIf(process.env.CREATURE_EXHAUSTIVE === "1")("ALL 4,860 combinations are valid (exhaustive)", () => {
    for (const o of allCombos()) checkCombo(o);
  }, 900_000);

  it("colors, names and power never change the structural key; build is deterministic", () => {
    const base = withOptions({});
    const a = buildModel(base);
    const recolored = applyTool(base, { name: "set_color", input: { component: "skin", color: "blue" } });
    const named = applyTool(base, { name: "set_identity", input: { name: [1, 2, 3], builder: [4, 5, 6] } });
    const powered = applyTool(base, { name: "set_color", input: { component: "core", color: "trans-red" } });
    for (const r of [recolored, named, powered]) {
      expect(r.ok).toBe(true);
      if (r.ok) expect(buildModel(r.params).structuralKey).toBe(a.structuralKey);
    }
    expect(JSON.stringify(buildModel(base))).toBe(JSON.stringify(buildModel(base)));
  });

  it("personalizes the power-up note with the creature's name", () => {
    const named = applyTool(withOptions({}), { name: "set_identity", input: { name: [0, 0, 0], builder: [0, 0, 0] } });
    expect(named.ok).toBe(true);
    if (!named.ok) return;
    const m = buildModel(named.params);
    expect(m.steps[m.steps.length - 1].note).toBe("Make a wish, then click Captain Fizzfang's power core into place.");
    expect(buildModel(withOptions({})).steps.at(-1)!.note).toContain("Your creature's power core");
  });

  it("each power changes only the core color", () => {
    for (const p of POWERS) {
      const r = applyTool(withOptions({}), { name: "set_color", input: { component: "core", color: p.colorId } });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const bom = computeBom(buildModel(r.params));
      expect(bom.lines.filter((l) => l.partId === "brick-round-1x1" && l.colorId === p.colorId).reduce((n, l) => n + l.quantity, 0)).toBeGreaterThanOrEqual(1);
      expect(powerOf(p.colorId).id).toBe(p.id);
    }
  });

  it("estimated cost leaves margin at the default fixed price for the covering set", () => {
    const price = 2400;
    for (const o of [...coveringSet(), ...seeded(100, 7)]) {
      const est = estimatePrice(computeBom(buildModel(withOptions(o))));
      const supplierTotal = est.totalCents - est.serviceFeeCents;
      expect(supplierTotal + paymentFeeEstimate(price) + 150).toBeLessThanOrEqual(0.8 * price);
    }
  });
});

describe("creature stats", () => {
  const st = (o: Record<string, string>) => creatureStats(buildModel(withOptions(o)));
  it("follow the parts", () => {
    for (const body of ["chunky", "long", "tall"]) {
      expect(st({ body, legs: "wheels" }).zoom).toBe(5);
      expect(st({ body, back: "wings" }).fly).toBe(5);
      expect(st({ body, back: "shell" }).armor).toBeGreaterThanOrEqual(3);
      expect(st({ body, head: "chomper" }).chomp).toBeGreaterThanOrEqual(4);
      expect(st({ body, head: "bug" }).chomp).toBeLessThanOrEqual(2);
    }
  });
  it("adding wings never lowers another stat", () => {
    for (const o of coveringSet()) {
      const a = st({ ...o, back: "none" });
      const b = st({ ...o, back: "wings" });
      for (const k of ["size", "zoom", "armor", "chomp"] as const) expect(b[k]).toBeGreaterThanOrEqual(a[k]);
    }
  });
  it("gives a Super title with a fixed tie priority", () => {
    expect(st({ legs: "wheels" }).title).toBe("Super Zoomer");
    expect(st({ legs: "stompers", back: "wings", head: "bug" }).title).toBe("Super Flyer");
  });
});

describe("names and builder tags", () => {
  const read = (f: string) => fs.readFileSync(f, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const blocked = read("tests/fixtures/blocklist.txt");
  const firstNames = new Set(read("tests/fixtures/first-names.txt"));

  it("no creature name contains a blocklisted substring or is a real first name", () => {
    let n = 0;
    for (let t = 0; t < TITLES.length; t++)
      for (let w = 0; w < WORDS.length; w++)
        for (let e = 0; e < ENDINGS.length; e++) {
          const name = renderName({ name: [t, w, e], builder: [0, 0, 0] }).toLowerCase();
          const compact = name.replace(/\s+/g, "");
          for (const b of blocked) expect(name.includes(b) || compact.includes(b), `${name} contains ${b}`).toBe(false);
          expect(firstNames.has(name.split(" ")[1])).toBe(false);
          n++;
        }
    expect(n).toBe(23040);
  });

  it("no builder tag contains a blocklisted substring", () => {
    for (let a = 0; a < ADJECTIVES.length; a++)
      for (let b = 0; b < ANIMALS.length; b++) {
        const tag = renderBuilder({ name: [0, 0, 0], builder: [a, b, 0] }).toLowerCase().replace(/\d+/g, "");
        for (const x of blocked) expect(tag.includes(x), `${tag} contains ${x}`).toBe(false);
        expect(firstNames.has(ANIMALS[b].toLowerCase())).toBe(false);
      }
    expect(renderBuilder({ name: [0, 0, 0], builder: [0, 0, NUMBER_COUNT - 1] })).toMatch(/99$/);
  });

  it("set_identity accepts only in-range integer indices and only for lab kits", () => {
    const base = withOptions({});
    for (const bad of [{ name: ["1", 2, 3], builder: [0, 0, 0] }, { name: [1.5, 2, 3], builder: [0, 0, 0] }, { name: [-1, 2, 3], builder: [0, 0, 0] }, { name: [TITLES.length, 0, 0], builder: [0, 0, 0] }, { name: [0, 0], builder: [0, 0, 0] }, { name: [0, 0, 0], builder: [0, 0, NUMBER_COUNT] }]) {
      expect(applyTool(base, { name: "set_identity", input: bad as never }).ok).toBe(false);
    }
    expect(isValidIdentity({ name: [0, 0, 0], builder: [0, 0, 0], extra: "x" })).toBe(false);
    expect(applyTool(defaultParams("cottage"), { name: "set_identity", input: { name: [0, 0, 0], builder: [0, 0, 0] } }).ok).toBe(false);
    expect(toolDefinitions("creature").map((t) => t.name)).not.toContain("set_identity");
  });
});

describe("worlds and animation helpers", () => {
  it("every world palette only uses colors allowed for each zone", () => {
    for (const w of WORLDS) {
      let p = withOptions({});
      for (const [component, color] of Object.entries(w.colors)) {
        const r = applyTool(p, { name: "set_color", input: { component, color } });
        expect(r.ok, `${w.id} ${component} ${color}`).toBe(true);
        if (r.ok) p = r.params;
      }
    }
  });

  it("partKey survives recompiles; a head swap keeps most keys, a recolor keeps all", () => {
    const a = buildModel(withOptions({ head: "chomper" }));
    const b = buildModel(withOptions({ head: "beak" }));
    const recolor = applyTool(withOptions({ head: "chomper" }), { name: "set_color", input: { component: "skin", color: "blue" } });
    const ka = new Set(a.parts.map(partKey));
    const shared = b.parts.filter((p) => ka.has(partKey(p))).length;
    expect(shared / a.parts.length).toBeGreaterThanOrEqual(0.7);
    if (recolor.ok) expect(buildModel(recolor.params).parts.every((p) => ka.has(partKey(p)))).toBe(true);
  });

  it("revealOrder follows build steps with the core last", () => {
    const order = revealOrder(buildModel(withOptions({ legs: "wheels" })).parts);
    for (let i = 1; i < order.length - 1; i++) expect(order[i].step).toBeGreaterThanOrEqual(order[i - 1].step);
    expect(order[order.length - 1].component).toBe("core");
  });
});
