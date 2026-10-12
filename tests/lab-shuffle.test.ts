import { describe, expect, it } from "vitest";
import { applyTool, type ToolCall } from "@/lib/edit/tools";
import {
  COLORS_LOCK,
  builderChoices,
  currentWorld,
  hashSeed,
  identityCall,
  pickDifferent,
  randomIdentity,
  seededRng,
  shuffleCalls,
  spinIndex,
  worldCalls,
} from "@/lib/creature/shuffle";
import { REEL_SIZES, isValidIdentity } from "@/lib/creature/words";
import { WORLDS } from "@/lib/creature/worlds";
import { buildModel, defaultParams, getKit } from "@/lib/model/templates";
import type { DesignParams } from "@/lib/model/types";
import { validateModel } from "@/lib/validation/validate";

const kit = getKit("creature");
const slotIds = kit.options.map((o) => o.id);

function applyAll(params: DesignParams, calls: ToolCall[]): DesignParams {
  let p = params;
  for (const c of calls) {
    const r = applyTool(p, c);
    expect(r.ok, `${c.name} ${JSON.stringify(c.input)} ${r.ok ? "" : r.error}`).toBe(true);
    if (r.ok) p = r.params;
  }
  return p;
}

describe("shuffle lever", () => {
  it("changes every unlocked slot to a different value and repaints with a different world", () => {
    const rnd = seededRng(1);
    let params = defaultParams("creature");
    for (let i = 0; i < 200; i++) {
      const calls = shuffleCalls(kit, params, [], rnd);
      const next = applyAll(params, calls);
      for (const id of slotIds) expect(next.options[id], `slot ${id} on pull ${i}`).not.toBe(params.options[id]);
      const world = currentWorld(next.colors);
      expect(world, "a shuffle always lands on a world palette").toBeDefined();
      expect(world?.id).not.toBe(currentWorld(params.colors)?.id);
      expect(next.colors.core, "the power core is chosen in the Power tab, not by Shuffle").toBe(params.colors.core);
      params = next;
    }
  });

  it("never touches locked slots or locked colors", () => {
    const rnd = seededRng(7);
    let params = applyAll(defaultParams("creature"), worldCalls(WORLDS[2], defaultParams("creature").colors));
    const locked = ["head", "back", COLORS_LOCK];
    for (let i = 0; i < 100; i++) {
      const calls = shuffleCalls(kit, params, locked, rnd);
      expect(calls.some((c) => c.input.option === "head" || c.input.option === "back")).toBe(false);
      expect(calls.some((c) => c.name === "set_color")).toBe(false);
      const next = applyAll(params, calls);
      expect(next.options.head).toBe(params.options.head);
      expect(next.options.back).toBe(params.options.back);
      expect(next.colors).toEqual(params.colors);
      for (const id of slotIds.filter((s) => !locked.includes(s))) expect(next.options[id]).not.toBe(params.options[id]);
      params = next;
    }
  });

  it("does nothing when everything is locked", () => {
    expect(shuffleCalls(kit, defaultParams("creature"), [...slotIds, COLORS_LOCK])).toEqual([]);
  });

  it("is one batch of plain tool calls, and every shuffled creature is buildable", () => {
    const rnd = seededRng(99);
    let params = defaultParams("creature");
    for (let i = 0; i < 12; i++) {
      const calls = shuffleCalls(kit, params, [], rnd, { identity: true });
      expect(calls.every((c) => ["set_option", "set_color", "set_identity"].includes(c.name))).toBe(true);
      expect(calls.filter((c) => c.name === "set_identity")).toHaveLength(1);
      params = applyAll(params, calls);
      const v = validateModel(buildModel(params));
      expect(v.errors).toEqual([]);
    }
  });

  it("the starter shuffle rolls a name and builder tag within the reels", () => {
    for (let s = 0; s < 300; s++) {
      const id = randomIdentity(seededRng(s));
      expect(isValidIdentity(id)).toBe(true);
      id.name.forEach((v, i) => expect(v).toBeLessThan(REEL_SIZES.name[i]));
      id.builder.forEach((v, i) => expect(v).toBeLessThan(REEL_SIZES.builder[i]));
      expect(applyTool(defaultParams("creature"), identityCall(id)).ok).toBe(true);
    }
    // The extremes of Math.random still land inside the reels.
    expect(isValidIdentity(randomIdentity(() => 0))).toBe(true);
    expect(isValidIdentity(randomIdentity(() => 0.9999999999))).toBe(true);
  });
});

describe("world palettes", () => {
  it("only sends the zones that change, and each world applies cleanly", () => {
    for (const w of WORLDS) {
      const base = defaultParams("creature");
      const calls = worldCalls(w, base.colors);
      expect(calls.length).toBeLessThanOrEqual(5);
      const next = applyAll(base, calls);
      expect(currentWorld(next.colors)?.id).toBe(w.id);
      expect(worldCalls(w, next.colors)).toEqual([]);
    }
  });
});

describe("reels and tags", () => {
  it("spins wrap around in both directions", () => {
    expect(spinIndex(0, -1, 24)).toBe(23);
    expect(spinIndex(23, 1, 24)).toBe(0);
    expect(spinIndex(5, 1, 24)).toBe(6);
    expect(spinIndex(0, -25, 24)).toBe(23);
  });

  it("offers three different builder tags, keeping the current one first", () => {
    const current: [number, number, number] = [3, 4, 5];
    const choices = builderChoices(current, seededRng(3));
    expect(choices).toHaveLength(3);
    expect(choices[0]).toEqual(current);
    expect(new Set(choices.map((c) => c.join(","))).size).toBe(3);
    for (const b of builderChoices(undefined, seededRng(4))) expect(isValidIdentity({ name: [0, 0, 0], builder: b })).toBe(true);
  });

  it("seeded choices are deterministic (server and browser render the same tags)", () => {
    const seed = hashSeed("6f1c1f5e-0000-4000-8000-000000000000");
    expect(builderChoices([1, 2, 3], seededRng(seed))).toEqual(builderChoices([1, 2, 3], seededRng(seed)));
    expect(hashSeed("a")).not.toBe(hashSeed("b"));
  });

  it("pickDifferent avoids the current value when it can", () => {
    const rnd = seededRng(5);
    for (let i = 0; i < 50; i++) expect(pickDifferent(["a", "b", "c"], "b", rnd)).not.toBe("b");
    expect(pickDifferent(["only"], "only", rnd)).toBe("only");
  });
});
