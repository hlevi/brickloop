import type { ColorId } from "../catalog/colors";
import type { MosaicFinish, MosaicSize } from "../model/mosaic";

export type OccasionId =
  | "birthday"
  | "love"
  | "thank-you"
  | "congrats"
  | "baby"
  | "wedding"
  | "holidays"
  | "thinking-of-you"
  | "new-home"
  | "just-because";

export interface Occasion {
  id: OccasionId;
  label: string;
  /** One line under the occasion title. */
  blurb: string;
  /** Default cover theme for cards made for this occasion. */
  theme: string;
}

export type CoverPattern = "plain" | "confetti" | "hearts" | "stars" | "dots" | "stripes" | "snow" | "leaves" | "sunburst";

export interface CoverTheme {
  id: string;
  label: string;
  /** Card stock color. */
  bg: string;
  /** Headline and text color. */
  ink: string;
  /** Pattern and detail color. */
  accent: string;
  pattern: CoverPattern;
}

/** What is inside the card: a 3D model built from a kit, or a brick mosaic. */
export type CardBuild =
  | { kind: "model"; kit: string; options?: Record<string, string>; colors?: Record<string, ColorId> }
  | { kind: "mosaic"; size: MosaicSize; finish?: MosaicFinish; base?: ColorId; /** presets.ts id; null = blank canvas */ preset: string | null };

export interface CardDef {
  /** URL slug, e.g. "birthday-cake". Stable: stored in designs and orders. */
  id: string;
  title: string;
  /** One short line for product tiles. */
  tagline: string;
  /** Product page paragraph. */
  description: string;
  occasions: OccasionId[];
  build: CardBuild;
  cover: {
    /** Default headline printed on the cover. */
    headline: string;
    /** Other headlines offered as one-tap choices. */
    suggestions: string[];
    /** Default theme id, and the themes offered for this card (default first). */
    theme: string;
    themes: string[];
  };
  /** Suggested inside message (the buyer can rewrite it). */
  message: string;
  /** Shown in "Our favorites" on the home page. Never described as best-selling. */
  featured?: boolean;
  /** Not listed in the shop (e.g. the blank canvas behind "Create your own"). */
  hidden?: boolean;
}
