import { blankCells, type MosaicSize } from "../model/mosaic";
import { defaultParams, getKit } from "../model/templates";
import type { DesignParams } from "../model/types";
import { CORE_CARDS } from "./defs/core";
import { CARDS_A } from "./defs/group-a";
import { CARDS_B } from "./defs/group-b";
import { CARDS_C } from "./defs/group-c";
import { MOSAIC_CARDS } from "./defs/mosaics";
import { presetCells } from "./presets";
import type { CardDef, OccasionId } from "./types";

/** Every card, listed or not. Ids are stable: designs and orders store them. */
export const CARDS: CardDef[] = [...CORE_CARDS, ...CARDS_A, ...CARDS_B, ...CARDS_C, ...MOSAIC_CARDS];

/** The id of the blank canvas behind "Create your own". */
export const CUSTOM_MOSAIC_CARD = "custom-mosaic";

export function listedCards(): CardDef[] {
  return CARDS.filter((c) => !c.hidden);
}

export function getCard(id: string): CardDef | undefined {
  return CARDS.find((c) => c.id === id);
}

export function cardsForOccasion(occasion: OccasionId): CardDef[] {
  return listedCards().filter((c) => c.occasions.includes(occasion));
}

export function featuredCards(): CardDef[] {
  return listedCards().filter((c) => c.featured);
}

/** Kit id behind a card. */
export function cardTemplate(card: CardDef): string {
  return card.build.kind === "model" ? card.build.kit : "mosaic";
}

/** The design params a card starts from: kit defaults, the card's own option and color picks, and its cover. */
export function defaultCardParams(card: CardDef): DesignParams {
  const cover = { cardId: card.id, headline: card.cover.headline, theme: card.cover.theme };
  if (card.build.kind === "model") {
    const base = defaultParams(card.build.kit);
    return { ...base, options: { ...base.options, ...card.build.options }, colors: { ...base.colors, ...card.build.colors }, card: cover };
  }
  const base = defaultParams("mosaic");
  const size: MosaicSize = card.build.size;
  return {
    ...base,
    options: { ...base.options, size: String(size), finish: card.build.finish ?? "tile" },
    colors: { ...base.colors, ...(card.build.base ? { base: card.build.base } : {}) },
    mosaic: { cells: card.build.preset ? presetCells(card.build.preset) : blankCells(size) },
    card: cover,
  };
}

/** Throws if a card points at a kit that does not exist (checked by tests for every card). */
export function assertCardKit(card: CardDef) {
  getKit(cardTemplate(card));
}
