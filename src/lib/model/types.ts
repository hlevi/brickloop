import type { ColorId } from "../catalog/colors";

export type Rotation = 0 | 90 | 180 | 270;
export type TemplateId = string;

/** One physical part placed in the model. Coordinates: x/z in studs, y in plates. */
export interface PlacedPart {
  uid: string;
  partId: string;
  colorId: ColorId;
  x: number;
  y: number;
  z: number;
  rot: Rotation;
  component: string;
  step: number;
  /** Non-stud attachment (e.g. wheel on a wheel-holder pin). */
  attachedTo?: string;
}

export interface BuildStep {
  index: number;
  title: string;
  note?: string;
}

export interface ComponentDef {
  id: string;
  label: string;
  colorId: ColorId;
  allowedColors: ColorId[];
}

/** The greeting card a design belongs to: which catalog card, and its cover. */
export interface CardParams {
  /** Catalog card id (src/lib/cards). */
  cardId: string;
  /** Cover headline, e.g. "Happy Birthday". Short free text from an adult purchaser. */
  headline: string;
  /** Cover theme id (src/lib/cards/themes.ts). */
  theme: string;
}

/** Bounded customization: a color per component and a value per option, plus mosaic cells and the card cover. */
export interface DesignParams {
  template: TemplateId;
  colors: Record<string, ColorId>;
  options: Record<string, string>;
  /** Mosaic designs only (template "mosaic"): cell colors, see model/mosaic.ts. Not part of the structural key. */
  mosaic?: { cells: string };
  /** Card cover. Not part of the structural key. */
  card?: CardParams;
}

/** The authoritative model. Preview, BOM and instructions all derive from this. */
export interface DesignModel {
  template: TemplateId;
  templateVersion: string;
  params: DesignParams;
  parts: PlacedPart[];
  components: ComponentDef[];
  steps: BuildStep[];
  /** Key identifying the structural configuration (excludes colors). */
  structuralKey: string;
}
