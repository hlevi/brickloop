import { describe, expect, it } from "vitest";
import { buildModel, defaultParams } from "@/lib/model/templates";
import { validateModel } from "@/lib/validation/validate";

const house = () => buildModel(defaultParams("house"));

describe("validation", () => {
  it("detects collisions", () => {
    const m = house();
    m.parts.push({ ...m.parts[5], uid: "dup" });
    const v = validateModel(m);
    expect(v.status).toBe("invalid");
    expect(v.errors.some((e) => e.code === "collision")).toBe(true);
  });

  it("detects floating parts", () => {
    const m = house();
    m.parts.push({ uid: "float", partId: "brick-2x2", colorId: "red", x: 30, y: 9, z: 30, rot: 0, component: "walls", step: 2 });
    const v = validateModel(m);
    expect(v.errors.some((e) => e.code === "disconnected" && e.parts?.includes("float"))).toBe(true);
  });

  it("detects parts placed before anything they attach to", () => {
    const m = house();
    const roof = m.parts.find((p) => p.component === "roof")!;
    roof.step = 1;
    const v = validateModel(m);
    expect(v.errors.some((e) => e.code === "step_order")).toBe(true);
  });

  it("rejects unknown parts and colors outside the palette", () => {
    const m = house();
    m.parts[0] = { ...m.parts[0], partId: "made-up-part" };
    expect(validateModel(m).errors.some((e) => e.code === "unknown_part")).toBe(true);
    const m2 = house();
    m2.components[0] = { ...m2.components[0], colorId: "orange" };
    expect(validateModel(m2).errors.some((e) => e.code === "color_not_allowed")).toBe(true);
  });

  it("only treats a configuration as physically validated when registered", () => {
    const m = house();
    expect(validateModel(m).physicallyValidated).toBe(false);
    expect(validateModel(m, new Set([m.structuralKey])).physicallyValidated).toBe(true);
  });
});
