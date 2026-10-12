import { describe, expect, it } from "vitest";
import { applyTool } from "@/lib/edit/tools";
import { planFromMessage } from "@/lib/edit/mockChat";
import { defaultParams } from "@/lib/model/templates";

describe("edit tools (deterministic validation)", () => {
  const house = defaultParams("house");
  it.each([
    [{ name: "set_color", input: { component: "chimney", color: "red" } }, /Unknown component/],
    [{ name: "set_color", input: { component: "roof", color: "purple" } }, /Unknown color/],
    [{ name: "set_color", input: { component: "windows", color: "red" } }, /not available/],
    [{ name: "set_house_width", input: { width: 12 } }, /6, 8, 10/],
    [{ name: "set_house_width", input: { width: "8" } }, /6, 8, 10/],
    [{ name: "set_roof_style", input: { style: "dome" } }, /gable, flat/],
    [{ name: "set_ladder_length", input: { length: 8 } }, /does not apply/],
    [{ name: "delete_everything", input: {} }, /Unknown edit/],
  ])("rejects %j", (call, msg) => {
    const r = applyTool(house, call);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });

  it("does not mutate the input params", () => {
    const before = JSON.stringify(house);
    applyTool(house, { name: "set_house_width", input: { width: 10 } });
    expect(JSON.stringify(house)).toBe(before);
  });
});

describe("mock conversation planner", () => {
  const house = defaultParams("house");
  it("maps clear requests to tool calls", () => {
    const p = planFromMessage("Make the roof blue and the walls yellow, and make it wider", house);
    expect(p.calls).toEqual(
      expect.arrayContaining([
        { name: "set_color", input: { component: "roof", color: "blue" } },
        { name: "set_color", input: { component: "walls", color: "yellow" } },
        { name: "set_house_width", input: { width: 10 } },
      ]),
    );
  });
  it("asks for clarification when the component is missing", () => {
    const p = planFromMessage("make it blue", house);
    expect(p.calls).toEqual([]);
    expect(p.reply).toMatch(/Which part/);
  });
  it("explains unsupported edits", () => {
    const p = planFromMessage("add a garage", house);
    expect(p.calls).toEqual([]);
    expect(p.reply).toMatch(/isn't supported/);
  });
  it("handles flat roof, dark gray and limits", () => {
    expect(planFromMessage("flat roof please", house).calls).toEqual([{ name: "set_roof_style", input: { style: "flat" } }]);
    expect(planFromMessage("dark gray roof", house).calls).toEqual([{ name: "set_color", input: { component: "roof", color: "dark-bluish-gray" } }]);
    const narrow = planFromMessage("narrower", { ...house, width: 6 } as typeof house);
    expect(narrow.calls).toEqual([]);
    expect(narrow.reply).toMatch(/narrowest/);
  });
  it("supports undo/reset and template-specific edits", () => {
    expect(planFromMessage("undo", house).control).toBe("undo");
    expect(planFromMessage("longer ladder", defaultParams("firetruck")).calls).toEqual([{ name: "set_ladder_length", input: { length: 10 } }]);
    expect(planFromMessage("make it 5 segments long", defaultParams("creature")).calls).toEqual([{ name: "set_creature_length", input: { segments: 5 } }]);
  });
});
