import { describe, expect, it } from "vitest";
import { computeBom } from "@/lib/bom/bom";
import { getPart } from "@/lib/catalog/parts";
import { applyTool } from "@/lib/edit/tools";
import { renderIso } from "@/lib/instructions/iso";
import { summarizeSteps } from "@/lib/instructions/steps";
import { compileBlueprint, grid } from "@/lib/model/kit";
import { buildModel, defaultParams, KITS } from "@/lib/model/templates";
import type { DesignParams } from "@/lib/model/types";
import { validateModel } from "@/lib/validation/validate";

/** Every option combination of every kit. */
function allConfigs(): DesignParams[] {
  const out: DesignParams[] = [];
  for (const k of KITS.filter((k) => !k.lab)) {
    let combos: Record<string, string>[] = [{}];
    for (const o of k.options) combos = combos.flatMap((c) => o.values.map((v) => ({ ...c, [o.id]: v.id })));
    for (const options of combos) out.push({ ...defaultParams(k.id), options });
  }
  return out;
}

describe("kits", () => {
  it("cover every age band from 4+ to 12+", () => {
    expect(new Set(KITS.map((k) => k.ageBand))).toEqual(new Set(["4+", "6+", "7+", "8+", "9+", "12+"]));
  });

  it.each(allConfigs().map((c) => [`${c.template} ${JSON.stringify(c.options)}`, c] as const))("%s passes digital validation", (_n, params) => {
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
      for (const s of model.steps) {
        expect(model.parts.some((p) => p.step === s.index)).toBe(true);
        expect(renderIso(model.parts, { uptoStep: s.index, highlightStep: s.index }).ops.length).toBeGreaterThan(0);
      }
    }
  });

  it("is deterministic", () => {
    for (const k of KITS.filter((k) => !k.lab)) expect(JSON.stringify(buildModel(defaultParams(k.id)))).toBe(JSON.stringify(buildModel(defaultParams(k.id))));
  });

  it("supported edits change the model, parts list and structural key consistently", () => {
    const base = defaultParams("cottage");
    const roomy = applyTool(base, { name: "set_option", input: { option: "size", value: "roomy" } });
    expect(roomy.ok).toBe(true);
    if (!roomy.ok) return;
    const a = buildModel(base);
    const b = buildModel(roomy.params);
    expect(b.structuralKey).not.toBe(a.structuralKey);
    expect(computeBom(b).totalPieces).toBeGreaterThan(computeBom(a).totalPieces);

    const recolor = applyTool(base, { name: "set_color", input: { component: "roof", color: "blue" } });
    expect(recolor.ok).toBe(true);
    if (!recolor.ok) return;
    const c = buildModel(recolor.params);
    expect(c.structuralKey).toBe(a.structuralKey); // colors do not change structure
    expect(c.parts.filter((p) => p.component === "roof").every((p) => p.colorId === "blue")).toBe(true);
    expect(computeBom(c).totalPieces).toBe(computeBom(a).totalPieces);

    const noChimney = applyTool(base, { name: "set_option", input: { option: "chimney", value: "no" } });
    expect(noChimney.ok && buildModel(noChimney.params).parts.some((p) => p.component === "chimney")).toBe(false);
    const taller = applyTool(defaultParams("rocket"), { name: "set_option", input: { option: "stages", value: "3" } });
    expect(taller.ok && buildModel(taller.params).steps.some((s) => s.title === "Stage 3")).toBe(true);
  });

  it("racer wheels are pinned to holders", () => {
    const m = buildModel(defaultParams("racer"));
    const wheels = m.parts.filter((p) => p.partId === "wheel-8x6");
    expect(wheels).toHaveLength(4);
    expect(wheels.every((w) => m.parts.find((h) => h.uid === w.attachedTo)?.partId === "plate-2x2-wheel-holder")).toBe(true);
  });
});

describe("kit compiler", () => {
  it("bridges joints so stacked same-shape layers stay connected", () => {
    const rows = grid(8, 2, () => "a");
    const { parts } = compileBlueprint({ legend: { a: { color: "red" } }, layers: [{ kind: "brick", step: "s", rows }, { kind: "brick", rows }, { kind: "brick", rows }] }, {});
    const model = { template: "t", templateVersion: "t", params: { template: "t", colors: {}, options: {} }, parts, components: [], steps: [{ index: 1, title: "s" }], structuralKey: "t" };
    expect(validateModel(model).status).toBe("valid");
  });

  it("rejects malformed blueprints", () => {
    expect(() => compileBlueprint({ legend: {}, layers: [{ kind: "brick", step: "s", rows: ["x"] }] }, {})).toThrow(/Unknown legend/);
    expect(() => compileBlueprint({ legend: { s: { color: "red", slope: "front" } }, layers: [{ kind: "brick", step: "s", rows: ["s"] }] }, {})).toThrow(/2-deep/);
  });
});
