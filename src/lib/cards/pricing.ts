import { PARTS } from "../catalog/parts";
import type { OperatingSettings } from "../settings";
import type { DesignModel } from "../model/types";

/**
 * Cards sell at one fixed price per tier, including printing, packing, delivery and taxes.
 * Model cards are tiered by piece count; mosaics by size.
 */
export type PriceTier = "mini" | "classic" | "grand" | "mosaic-8" | "mosaic-16";

export const TIER_LABELS: Record<PriceTier, string> = {
  mini: "Mini build",
  classic: "Classic build",
  grand: "Grand build",
  "mosaic-8": "Mini mosaic",
  "mosaic-16": "Mosaic",
};

/** Upper piece-count bounds for the model tiers. */
export const MINI_MAX_PIECES = 45;
export const CLASSIC_MAX_PIECES = 90;

/** Pieces in the box: placed parts plus their accessories (e.g. tires). */
export function pieceCount(model: Pick<DesignModel, "parts">): number {
  let n = 0;
  for (const p of model.parts) n += 1 + (PARTS[p.partId]?.accessories ?? []).reduce((a, x) => a + x.qty, 0);
  return n;
}

export function priceTier(model: Pick<DesignModel, "template" | "params" | "parts">): PriceTier {
  if (model.template === "mosaic") return model.params.options.size === "8" ? "mosaic-8" : "mosaic-16";
  const n = pieceCount(model);
  return n <= MINI_MAX_PIECES ? "mini" : n <= CLASSIC_MAX_PIECES ? "classic" : "grand";
}

export function tierPriceCents(tier: PriceTier, s: Pick<OperatingSettings, "cardPrices">): number {
  return s.cardPrices[tier];
}

export function cardPriceCents(model: Pick<DesignModel, "template" | "params" | "parts">, s: Pick<OperatingSettings, "cardPrices">): number {
  return tierPriceCents(priceTier(model), s);
}
