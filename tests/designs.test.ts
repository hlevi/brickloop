import { beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { applyEdits, budgetSuggestions, chat, createDesign, getDesignView, listDesigns, reset, undo } from "@/lib/designs";
import { freshDb } from "./helpers";

const alice = crypto.randomUUID();
const bob = crypto.randomUUID();

describe("designs", () => {
  beforeEach(async () => {
    await freshDb();
  });

  it("creates, edits, undoes and resets with versioned revisions", async () => {
    const id = await createDesign(alice, "cottage");
    const v1 = await getDesignView(alice, id);
    expect(v1.revision.rev).toBe(1);
    expect(v1.revision.canUndo).toBe(false);
    const out = await applyEdits(alice, id, [{ name: "set_option", input: { option: "size", value: "roomy" } }, { name: "set_color", input: { component: "roof", color: "purple" } }], "visual");
    expect(out.applied).toHaveLength(1);
    expect(out.rejected[0]).toMatch(/Unknown color/);
    const v2 = await getDesignView(alice, id);
    expect(v2.params.options.size).toBe("roomy");
    expect(v2.bom.totalPieces).toBeGreaterThan(v1.bom.totalPieces);
    await undo(alice, id);
    const v3 = await getDesignView(alice, id);
    expect(v3.revision.id).toBe(v1.revision.id);
    await expect(undo(alice, id)).rejects.toThrow(/Nothing to undo/);
    await applyEdits(alice, id, [{ name: "set_option", input: { option: "chimney", value: "no" } }], "visual");
    await reset(alice, id);
    const v4 = await getDesignView(alice, id);
    expect(v4.params).toEqual(v1.params);
    expect(v4.revision.rev).toBeGreaterThan(3);
  });

  it("isolates customers' designs", async () => {
    const id = await createDesign(alice, "pup");
    await expect(getDesignView(bob, id)).rejects.toThrow(/not found/i);
    await expect(applyEdits(bob, id, [{ name: "set_option", input: { option: "spots", value: "no" } }], "visual")).rejects.toThrow(/not found/i);
    expect(await listDesigns(bob)).toHaveLength(0);
    expect(await listDesigns(alice)).toHaveLength(1);
  });

  it("chat in mock mode applies validated edits and clarifies ambiguity", async () => {
    process.env.CHAT_MODE = "mock";
    const id = await createDesign(alice, "cottage");
    const r1 = await chat(alice, id, "make the roof black and remove the chimney, no chimney");
    expect(r1.mode).toBe("mock");
    expect(r1.applied).toEqual(expect.arrayContaining(["roof set to Black", "chimney set to No chimney"]));
    const r2 = await chat(alice, id, "make it green");
    expect(r2.applied).toEqual([]);
    expect(r2.reply).toMatch(/Which part/);
    const r3 = await chat(alice, id, "undo");
    expect(r3.reply).toMatch(/Undone/);
    const v = await getDesignView(alice, id);
    expect(v.params.options.chimney).toBe("yes");
  });

  it("suggests supported edits that fit a budget", async () => {
    const id = await createDesign(alice, "cottage");
    await applyEdits(alice, id, [{ name: "set_option", input: { option: "size", value: "roomy" } }], "visual");
    const v = await getDesignView(alice, id);
    const s = await budgetSuggestions(alice, id, v.estimate.totalCents - 1);
    expect(s.withinBudget).toBe(false);
    expect(s.suggestions.length).toBeGreaterThan(0);
    expect(s.suggestions.every((x) => x.estimateCents < v.estimate.totalCents)).toBe(true);
  });
});
