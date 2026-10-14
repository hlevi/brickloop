import { describe, expect, it } from "vitest";
import { COLORS } from "@/lib/catalog/colors";
import { assertCardKit, CARDS, cardTemplate, CUSTOM_MOSAIC_CARD, defaultCardParams, getCard, listedCards } from "@/lib/cards/catalog";
import { isOccasionId, OCCASIONS } from "@/lib/cards/occasions";
import { MOSAIC_PRESETS, presetCells } from "@/lib/cards/presets";
import { CLASSIC_MAX_PIECES, MINI_MAX_PIECES, pieceCount, priceTier } from "@/lib/cards/pricing";
import { COVER_THEMES, isThemeId } from "@/lib/cards/themes";
import { HEADLINE_MAX } from "@/lib/edit/tools";
import { blankCells, buildMosaic, charColor, decodeCells, encodeCells, MOSAIC_CHARS, MOSAIC_PALETTE, pixelArt, resampleCells } from "@/lib/model/mosaic";
import { buildModel } from "@/lib/model/templates";
import { validateModel } from "@/lib/validation/validate";
import { DEFAULT_SETTINGS } from "@/lib/settings";

describe("card catalog", () => {
  it("has unique, URL-safe ids and a hidden blank mosaic canvas", () => {
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    for (const c of CARDS) expect(c.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(getCard(CUSTOM_MOSAIC_CARD)?.hidden).toBe(true);
    expect(listedCards().some((c) => c.id === CUSTOM_MOSAIC_CARD)).toBe(false);
  });

  it.each(CARDS.map((c) => [c.id, c] as const))("%s is complete and builds a valid model", (_id, card) => {
    assertCardKit(card);
    expect(card.title && card.tagline && card.description && card.message).toBeTruthy();
    expect(card.occasions.length).toBeGreaterThan(0);
    for (const o of card.occasions) expect(isOccasionId(o)).toBe(true);
    expect(card.cover.themes[0]).toBe(card.cover.theme);
    for (const t of card.cover.themes) expect(isThemeId(t)).toBe(true);
    for (const h of [card.cover.headline, ...card.cover.suggestions]) expect(h.length).toBeLessThanOrEqual(HEADLINE_MAX);
    expect(card.cover.suggestions).toContain(card.cover.headline);
    const params = defaultCardParams(card);
    expect(params.template).toBe(cardTemplate(card));
    expect(params.card).toEqual({ cardId: card.id, headline: card.cover.headline, theme: card.cover.theme });
    const model = buildModel(params);
    expect(validateModel(model).status).toBe("valid");
    expect(DEFAULT_SETTINGS.cardPrices[priceTier(model)]).toBeGreaterThan(0);
  });

  it("every occasion has a default theme that exists", () => {
    for (const o of OCCASIONS) expect(isThemeId(o.theme)).toBe(true);
    expect(new Set(COVER_THEMES.map((t) => t.id)).size).toBe(COVER_THEMES.length);
  });

  it("tiers model cards by piece count and mosaics by size", () => {
    const pup = buildModel(defaultCardParams(getCard("puppy-love")!));
    const n = pieceCount(pup);
    expect(priceTier(pup)).toBe(n <= MINI_MAX_PIECES ? "mini" : n <= CLASSIC_MAX_PIECES ? "classic" : "grand");
    const heart = buildModel(defaultCardParams(getCard("brick-heart")!));
    expect(priceTier(heart)).toBe("mosaic-16");
    expect(pieceCount(heart)).toBe(257);
  });
});

describe("mosaics", () => {
  it("palette is 36 distinct real colors, one per base-36 character", () => {
    expect(MOSAIC_PALETTE).toHaveLength(MOSAIC_CHARS.length);
    expect(new Set(MOSAIC_PALETTE).size).toBe(MOSAIC_PALETTE.length);
    for (const c of MOSAIC_PALETTE) expect(COLORS[c]).toBeTruthy();
    expect(charColor("#")).toBeNull();
    expect(decodeCells(encodeCells(["red", "white", "dark-tan"]))).toEqual(["red", "white", "dark-tan"]);
  });

  it("builds a base plate plus one piece per cell, picture top row at the back, 4 rows per step", () => {
    const cells = pixelArt(["r.......", ...Array(7).fill("........")], { r: "red", ".": "white" });
    const { parts, steps } = buildMosaic(8, "dot", "black", cells);
    expect(parts).toHaveLength(65);
    expect(parts[0]).toMatchObject({ partId: "plate-8x8", colorId: "black", y: 0 });
    expect(parts.find((p) => p.colorId === "red")).toMatchObject({ partId: "plate-round-1x1", x: 0, y: 1, z: 7, step: 2 });
    expect(steps.map((s) => s.title)).toEqual(["Base plate", "Rows 1 to 4", "Rows 5 to 8"]);
    expect(() => buildMosaic(8, "tile", "white", "0".repeat(10))).toThrow();
  });

  it("resamples between sizes and rejects bad pixel art", () => {
    const big = blankCells(16, "red");
    expect(resampleCells(big, 16, 8)).toBe(blankCells(8, "red"));
    expect(resampleCells(blankCells(8, "blue"), 8, 16)).toBe(blankCells(16, "blue"));
    expect(() => pixelArt(["ab", "a"], { a: "red", b: "blue" })).toThrow(/Row 1/);
    expect(() => pixelArt(["ax", "aa"], { a: "red" })).toThrow(/legend/);
  });

  it.each(MOSAIC_PRESETS.map((p) => [p.id, p] as const))("preset %s is a valid square picture", (_id, p) => {
    expect(p.rows).toHaveLength(p.size);
    expect(presetCells(p.id)).toHaveLength(p.size * p.size);
  });
});
