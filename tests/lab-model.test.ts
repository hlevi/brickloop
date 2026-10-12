import { describe, expect, it } from "vitest";
import { partKey, revealOrder } from "@/lib/creature/anim";
import { FIT_QUERY, Lru, ZONES, easeOutBack, labModel, labTabs, lookKey, recolor, revealCaption, revealStep, statChanges, tileJobs } from "@/lib/creature/lab";
import { creatureStats } from "@/lib/creature/stats";
import { seededRng, shuffleCalls } from "@/lib/creature/shuffle";
import { WORLDS } from "@/lib/creature/worlds";
import { applyTool } from "@/lib/edit/tools";
import { buildModel, defaultParams, getKit } from "@/lib/model/templates";
import type { DesignParams } from "@/lib/model/types";

const kit = getKit("creature");
const strip = (p: { parts: { uid: string }[] }) => p.parts.map(({ uid: _uid, ...rest }) => rest);

describe("lab tabs", () => {
  it("has Body, Legs, Head, Eyes, Tail, Back, Top, then Colors, Power, Name", () => {
    const tabs = labTabs(kit);
    expect(tabs.map((t) => t.label)).toEqual(["Body", "Legs", "Head", "Eyes", "Tail", "Back", "Top", "Colors", "Power", "Name"]);
    expect(tabs.every((t) => t.icon.length > 0)).toBe(true);
    expect(tabs.filter((t) => t.lockable).map((t) => t.id)).toEqual([...kit.options.map((o) => o.id), "colors"]);
  });

  it("every structural tab offers 3-5 tiles, and every paint zone is a real component", () => {
    for (const o of kit.options) {
      expect(o.values.length).toBeGreaterThanOrEqual(3);
      expect(o.values.length).toBeLessThanOrEqual(5);
    }
    for (const z of ZONES) expect(kit.components.some((c) => c.id === z.id)).toBe(true);
  });
});

describe("client-side model", () => {
  it("labModel matches buildModel for shapes and colors (repainting a compiled shape is exact)", () => {
    const rnd = seededRng(11);
    let params: DesignParams = defaultParams("creature");
    for (let i = 0; i < 8; i++) {
      for (const c of shuffleCalls(kit, params, [], rnd)) {
        const r = applyTool(params, c);
        if (r.ok) params = r.params;
      }
      // Compile the shape first, then ask for every world in that shape: those come from recolor().
      expect(strip(labModel(params))).toEqual(strip(buildModel(params)));
      for (const w of WORLDS) {
        const p2 = { ...params, colors: { ...params.colors, ...w.colors, core: "trans-red" as const } };
        const m = labModel(p2);
        expect(strip(m)).toEqual(strip(buildModel(p2)));
        expect(m.structuralKey).toBe(buildModel(p2).structuralKey);
      }
    }
  });

  it("renaming never changes the look key, so the creature is not recompiled", () => {
    const p = defaultParams("creature");
    const named = { ...p, identity: { name: [1, 2, 3] as [number, number, number], builder: [4, 5, 6] as [number, number, number] } };
    expect(lookKey(named)).toBe(lookKey(p));
    expect(labModel(named)).toBe(labModel(p));
  });

  it("recolor only repaints customizable zones (pupils, wheels and details keep their colors)", () => {
    const p = { ...defaultParams("creature"), options: { ...defaultParams("creature").options, legs: "wheels", head: "robo" } };
    const m = buildModel(p);
    const painted = recolor(m.parts, { skin: "red", feet: "white" });
    painted.forEach((q, i) => {
      const before = m.parts[i];
      if (before.component === "skin") expect(q.colorId).toBe("red");
      else if (before.component === "feet") expect(q.colorId).toBe("white");
      else expect(q.colorId).toBe(before.colorId);
    });
  });

  it("the LRU evicts the least recently used entry", () => {
    const evicted: string[] = [];
    const l = new Lru<string>(2, (v) => evicted.push(v));
    l.set("a", "A");
    l.set("b", "B");
    l.get("a");
    l.set("c", "C");
    expect(evicted).toEqual(["B"]);
    expect(l.has("a") && l.has("c") && !l.has("b")).toBe(true);
  });
});

describe("alive-mode motion", () => {
  it("easeOutBack starts at 0, overshoots, and lands exactly at 1", () => {
    expect(easeOutBack(0)).toBeCloseTo(0, 6);
    expect(easeOutBack(1)).toBeCloseTo(1, 6);
    const peak = Math.max(...Array.from({ length: 50 }, (_, i) => easeOutBack(i / 49)));
    expect(peak).toBeGreaterThan(1);
    expect(easeOutBack(2)).toBeCloseTo(1, 6);
  });

  it("the reveal takes about 2.5 s for any creature size", () => {
    for (const n of [29, 39, 45, 61]) {
      const total = (n - 1) * revealStep(n);
      expect(total).toBeGreaterThan(2.2);
      expect(total).toBeLessThanOrEqual(2.5);
    }
    expect(revealStep(1)).toBe(0);
  });

  it("a slot change keeps most meshes (stable part keys), so only the new bricks drop in", () => {
    const a = buildModel(defaultParams("creature"));
    const b = buildModel({ ...defaultParams("creature"), options: { ...defaultParams("creature").options, back: "wings" } });
    const ka = new Set(a.parts.map(partKey));
    const kept = b.parts.filter((p) => ka.has(partKey(p))).length;
    expect(kept / b.parts.length).toBeGreaterThan(0.7);
    expect(revealOrder(b.parts).at(-1)?.component).toBe("core");
  });

  it("the reveal caption follows the real booklet steps and ends on Power up!", () => {
    const m = buildModel({ ...defaultParams("creature"), options: { ...defaultParams("creature").options, legs: "wheels" } });
    const order = revealOrder(m.parts);
    const captions = order.map((p) => revealCaption(m.steps, p.step));
    expect(captions.every((c) => c !== null)).toBe(true);
    const ns = captions.map((c) => c!.n);
    expect(ns).toEqual([...ns].sort((a, b) => a - b));
    expect(captions[0]).toEqual({ n: 1, total: m.steps.length, title: "Wheels" });
    expect(captions.at(-1)?.title).toBe("Power up!");
    expect(captions.at(-1)?.n).toBe(m.steps.length);
    expect(revealCaption(m.steps, 999)).toBeNull();
  });
});

describe("stage feedback", () => {
  it("statChanges lists only the stats that moved, in card order", () => {
    const base = buildModel(defaultParams("creature"));
    const wings = buildModel({ ...defaultParams("creature"), options: { ...defaultParams("creature").options, back: "wings" } });
    const a = creatureStats(base);
    const b = creatureStats(wings);
    const ch = statChanges(a, b);
    expect(ch.find((c) => c.key === "fly")?.delta).toBe(b.fly - a.fly);
    expect(b.fly).toBe(5);
    for (const c of ch) expect(c.delta).not.toBe(0);
    expect(ch.map((c) => c.key)).toEqual(["size", "zoom", "fly", "armor", "chomp"].filter((k) => ch.some((c) => c.key === k)));
    expect(statChanges(null, b)).toEqual([]);
    expect(statChanges(b, b)).toEqual([]);
  });

  it("tileJobs covers every tile of every tab, each differing from the creature in one choice only", () => {
    const p = defaultParams("creature");
    const jobs = tileJobs(kit, p);
    expect(jobs).toHaveLength(kit.options.reduce((n, o) => n + o.values.length, 0) + WORLDS.length);
    expect(new Set(jobs.map((j) => j.id)).size).toBe(jobs.length);
    for (const j of jobs) {
      const changedOptions = Object.keys(p.options).filter((k) => j.params.options[k] !== p.options[k]);
      expect(changedOptions.length).toBeLessThanOrEqual(1);
      expect(j.params.colors.core).toBe(p.colors.core);
    }
  });

  it("FIT_QUERY names the tablet/desktop layouts that keep everything on one screen", () => {
    expect(FIT_QUERY).toContain("(min-width: 900px) and (min-height: 560px)");
    expect(FIT_QUERY).toContain("(min-width: 600px) and (max-width: 899px) and (min-height: 860px)");
  });
});
