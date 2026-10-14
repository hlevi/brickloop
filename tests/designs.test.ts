import { beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { applyEdits, createCardDesign, createDesign, getDesignView, listDesigns, previewCard, reset, undo } from "@/lib/designs";
import { DEFAULT_SETTINGS } from "@/lib/settings";
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
    const out = await applyEdits(alice, id, [{ name: "set_option", input: { option: "size", value: "roomy" } }, { name: "set_color", input: { component: "roof", color: "purple" } }]);
    expect(out.applied).toHaveLength(1);
    expect(out.rejected[0]).toMatch(/Unknown color/);
    const v2 = await getDesignView(alice, id);
    expect(v2.params.options.size).toBe("roomy");
    expect(v2.bom.totalPieces).toBeGreaterThan(v1.bom.totalPieces);
    await undo(alice, id);
    const v3 = await getDesignView(alice, id);
    expect(v3.revision.id).toBe(v1.revision.id);
    await expect(undo(alice, id)).rejects.toThrow(/Nothing to undo/);
    await applyEdits(alice, id, [{ name: "set_option", input: { option: "chimney", value: "no" } }]);
    await reset(alice, id);
    const v4 = await getDesignView(alice, id);
    expect(v4.params).toEqual(v1.params);
    expect(v4.revision.rev).toBeGreaterThan(3);
  });

  it("isolates customers' designs", async () => {
    const id = await createDesign(alice, "pup");
    await expect(getDesignView(bob, id)).rejects.toThrow(/not found/i);
    await expect(applyEdits(bob, id, [{ name: "set_option", input: { option: "spots", value: "no" } }])).rejects.toThrow(/not found/i);
    expect(await listDesigns(bob)).toHaveLength(0);
    expect(await listDesigns(alice)).toHaveLength(1);
  });

  it("creates a card design with the shopper's choices in one revision, and resets to the card's defaults", async () => {
    const id = await createCardDesign(alice, "home-sweet-home", [
      { name: "set_color", input: { component: "roof", color: "blue" } },
      { name: "set_card", input: { headline: "Welcome Home, Sam" } },
    ]);
    const v = await getDesignView(alice, id);
    expect(v.revision.rev).toBe(1);
    expect(v.card).toEqual({ id: "home-sweet-home", title: "Home Sweet Home", headline: "Welcome Home, Sam", theme: "sage-leaves" });
    expect(v.params.colors.roof).toBe("blue");
    expect(v.template).toBe("cottage");
    expect(v.priceCents).toBe(DEFAULT_SETTINGS.cardPrices[v.tier]);
    expect((await listDesigns(alice))[0].card?.headline).toBe("Welcome Home, Sam");
    await reset(alice, id);
    const r = await getDesignView(alice, id);
    expect(r.card?.headline).toBe("Home Sweet Home");
    expect(r.params.colors.roof).toBe("red");
  });

  it("rejects unknown cards and invalid choices when creating, and previews without saving", async () => {
    await expect(createCardDesign(alice, "no-such-card")).rejects.toThrow(/Card not found/);
    await expect(createCardDesign(alice, "brick-heart", [{ name: "set_card", input: { theme: "holly-snow" } }])).rejects.toThrow(/cover themes/);
    const p = await previewCard("brick-heart", [{ name: "set_option", input: { option: "size", value: "8" } }]);
    expect(p.tier).toBe("mosaic-8");
    expect(p.model.parts).toHaveLength(65);
    expect(p.validation.status).toBe("valid");
    expect(await listDesigns(alice)).toHaveLength(0);
  });
});
