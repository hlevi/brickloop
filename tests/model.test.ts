import { describe, expect, it } from "vitest";
import { computeBom } from "@/lib/bom/bom";
import { getPart } from "@/lib/catalog/parts";
import { applyTool } from "@/lib/edit/tools";
import { renderIso } from "@/lib/instructions/iso";
import { summarizeSteps } from "@/lib/instructions/steps";
import { buildModel, defaultParams } from "@/lib/model/templates";
import type { DesignParams } from "@/lib/model/types";
import { validateModel } from "@/lib/validation/validate";

function allConfigs(): DesignParams[] {
  const out: DesignParams[] = [];
  for (const width of [6, 8, 10] as const)
    for (const roofStyle of ["gable", "flat"] as const) out.push({ ...(defaultParams("house") as Extract<DesignParams, { template: "house" }>), width, roofStyle });
  for (const ladderLength of [6, 8, 10] as const) out.push({ ...(defaultParams("firetruck") as Extract<DesignParams, { template: "firetruck" }>), ladderLength });
  for (const bodyLength of [2, 3, 4, 5] as const) out.push({ ...(defaultParams("creature") as Extract<DesignParams, { template: "creature" }>), bodyLength });
  return out;
}

describe("starter models", () => {
  it.each(allConfigs().map((c) => [`${c.template}:${JSON.stringify(c).length}`, c] as const))("%s passes digital validation", (_n, params) => {
    const model = buildModel(params);
    const v = validateModel(model);
    expect(v.errors).toEqual([]);
    expect(v.status).toBe("valid");
    expect(v.physicallyValidated).toBe(false); // no physical builds recorded
  });

  it("parts list, step callouts and preview derive from the same model", () => {
    for (const params of allConfigs()) {
      const model = buildModel(params);
      const bom = computeBom(model);
      const stepTotal = summarizeSteps(model).reduce((n, s) => n + s.pieceCount, 0);
      const accessoryCount = model.parts.reduce((n, p) => n + (getPart(p.partId).accessories ?? []).reduce((a, x) => a + x.qty, 0), 0);
      expect(bom.totalPieces).toBe(model.parts.length + accessoryCount);
      expect(stepTotal).toBe(bom.totalPieces);
      // every step page shows at least one new part and the preview draws something per step
      for (const s of model.steps) {
        expect(model.parts.some((p) => p.step === s.index)).toBe(true);
        expect(renderIso(model.parts, { uptoStep: s.index, highlightStep: s.index }).ops.length).toBeGreaterThan(0);
      }
    }
  });

  it("supported edits change the model, parts list and structural key consistently", () => {
    const base = defaultParams("house");
    const wider = applyTool(base, { name: "set_house_width", input: { width: 10 } });
    expect(wider.ok).toBe(true);
    if (!wider.ok) return;
    const a = buildModel(base);
    const b = buildModel(wider.params);
    expect(b.structuralKey).not.toBe(a.structuralKey);
    expect(computeBom(b).lines.filter((l) => l.partId === "plate-6x10").reduce((n, l) => n + l.quantity, 0)).toBe(2); // base + roof
    expect(computeBom(a).lines.find((l) => l.partId === "plate-6x10")).toBeUndefined();

    const recolor = applyTool(base, { name: "set_color", input: { component: "roof", color: "blue" } });
    expect(recolor.ok).toBe(true);
    if (!recolor.ok) return;
    const c = buildModel(recolor.params);
    expect(c.structuralKey).toBe(a.structuralKey); // colors do not change structure
    expect(c.parts.filter((p) => p.component === "roof").every((p) => p.colorId === "blue")).toBe(true);
    expect(computeBom(c).totalPieces).toBe(computeBom(a).totalPieces);

    const ladder = applyTool(defaultParams("firetruck"), { name: "set_ladder_length", input: { length: 10 } });
    expect(ladder.ok && computeBom(buildModel(ladder.params)).lines.some((l) => l.partId === "plate-2x10")).toBe(true);
    const longer = applyTool(defaultParams("creature"), { name: "set_creature_length", input: { segments: 5 } });
    expect(longer.ok && buildModel(longer.params).parts.filter((p) => p.component === "body").length).toBe(5);
  });

  it("flat roof uses no slopes and gable roof has a ridge", () => {
    const flat = buildModel({ ...(defaultParams("house") as Extract<DesignParams, { template: "house" }>), roofStyle: "flat" });
    expect(flat.parts.some((p) => p.partId.startsWith("slope") || p.partId.startsWith("ridge"))).toBe(false);
    const gable = buildModel(defaultParams("house"));
    expect(gable.parts.some((p) => p.partId.startsWith("ridge"))).toBe(true);
  });
});
