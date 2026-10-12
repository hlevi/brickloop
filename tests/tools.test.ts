import { describe, expect, it } from "vitest";
import { applyTool } from "@/lib/edit/tools";
import { planFromMessage } from "@/lib/edit/mockChat";
import { defaultParams } from "@/lib/model/templates";

describe("edit tools (deterministic validation)", () => {
  const cottage = defaultParams("cottage");
  it.each([
    [{ name: "set_color", input: { component: "garage", color: "red" } }, /Unknown component/],
    [{ name: "set_color", input: { component: "roof", color: "purple" } }, /Unknown color/],
    [{ name: "set_color", input: { component: "windows", color: "red" } }, /not available/],
    [{ name: "set_option", input: { option: "size", value: "huge" } }, /must be one of/],
    [{ name: "set_option", input: { option: "stages", value: "3" } }, /Unknown option/],
    [{ name: "set_option", input: { option: "size" } }, /must be one of/],
    [{ name: "delete_everything", input: {} }, /Unknown edit/],
  ])("rejects %j", (call, msg) => {
    const r = applyTool(cottage, call);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });

  it("does not mutate the input params", () => {
    const before = JSON.stringify(cottage);
    applyTool(cottage, { name: "set_option", input: { option: "size", value: "roomy" } });
    expect(JSON.stringify(cottage)).toBe(before);
  });
});

describe("mock conversation planner", () => {
  const cottage = defaultParams("cottage");
  it("maps clear requests to tool calls", () => {
    const p = planFromMessage("Make the roof blue and the walls yellow, and make it bigger", cottage);
    expect(p.calls).toEqual(
      expect.arrayContaining([
        { name: "set_color", input: { component: "roof", color: "blue" } },
        { name: "set_color", input: { component: "walls", color: "yellow" } },
        { name: "set_option", input: { option: "size", value: "roomy" } },
      ]),
    );
  });
  it("asks for clarification when the component is missing", () => {
    const p = planFromMessage("make it blue", cottage);
    expect(p.calls).toEqual([]);
    expect(p.reply).toMatch(/Which part/);
  });
  it("explains unsupported edits", () => {
    const p = planFromMessage("add a garage", cottage);
    expect(p.calls).toEqual([]);
    expect(p.reply).toMatch(/isn't supported/);
  });
  it("handles option synonyms, multi-word colors and limits", () => {
    expect(planFromMessage("no chimney please", cottage).calls).toEqual([{ name: "set_option", input: { option: "chimney", value: "no" } }]);
    expect(planFromMessage("dark gray roof", cottage).calls).toEqual([{ name: "set_color", input: { component: "roof", color: "dark-bluish-gray" } }]);
    const smaller = planFromMessage("make it smaller", cottage);
    expect(smaller.calls).toEqual([]);
    expect(smaller.reply).toMatch(/smallest/);
  });
  it("works across kits", () => {
    expect(planFromMessage("undo", cottage).control).toBe("undo");
    expect(planFromMessage("make the rocket taller", defaultParams("rocket")).calls).toEqual([{ name: "set_option", input: { option: "stages", value: "3" } }]);
    expect(planFromMessage("close the mouth and make the skin orange", defaultParams("dino")).calls).toEqual(
      expect.arrayContaining([
        { name: "set_option", input: { option: "jaw", value: "closed" } },
        { name: "set_color", input: { component: "skin", color: "orange" } },
      ]),
    );
    expect(planFromMessage("pink blossoms in bloom", defaultParams("bonsai")).calls).toEqual(
      expect.arrayContaining([{ name: "set_option", input: { option: "blossoms", value: "yes" } }]),
    );
  });
});
