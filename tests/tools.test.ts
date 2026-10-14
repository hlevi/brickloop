import { describe, expect, it } from "vitest";
import { applyTool } from "@/lib/edit/tools";
import { defaultCardParams, getCard } from "@/lib/cards/catalog";
import { decodeCells } from "@/lib/model/mosaic";
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

describe("mosaic and card cover tools", () => {
  const heart = defaultCardParams(getCard("brick-heart")!);

  it("paints a mosaic only with valid cells for its size", () => {
    expect(applyTool(heart, { name: "set_mosaic", input: { cells: "0".repeat(256) } }).ok).toBe(true);
    expect(applyTool(heart, { name: "set_mosaic", input: { cells: "0".repeat(64) } }).ok).toBe(false);
    expect(applyTool(heart, { name: "set_mosaic", input: { cells: "#".repeat(256) } }).ok).toBe(false);
    expect(applyTool(defaultParams("cottage"), { name: "set_mosaic", input: { cells: "0".repeat(256) } }).ok).toBe(false);
  });

  it("resamples the picture when the size changes", () => {
    const r = applyTool(heart, { name: "set_option", input: { option: "size", value: "8" } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.params.mosaic!.cells).toHaveLength(64);
    expect(decodeCells(r.params.mosaic!.cells)).toContain("red");
  });

  it("sets the cover headline (cleaned and capped) and only the card's own themes", () => {
    const r = applyTool(heart, { name: "set_card", input: { headline: "  Happy\n  <b>Anniversary</b>  " } });
    expect(r.ok && r.params.card!.headline).toBe("Happy bAnniversary/b");
    const long = applyTool(heart, { name: "set_card", input: { headline: "x".repeat(200) } });
    expect(long.ok && long.params.card!.headline.length).toBe(40);
    expect(applyTool(heart, { name: "set_card", input: { headline: "   " } }).ok).toBe(false);
    expect(applyTool(heart, { name: "set_card", input: { theme: "lilac-dots" } }).ok).toBe(true);
    expect(applyTool(heart, { name: "set_card", input: { theme: "holly-snow" } }).ok).toBe(false);
    expect(applyTool(defaultParams("pup"), { name: "set_card", input: { headline: "Hi" } }).ok).toBe(false);
  });
});
