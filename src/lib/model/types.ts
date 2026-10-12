import type { ColorId } from "../catalog/colors";

export type Rotation = 0 | 90 | 180 | 270;
export type TemplateId = "house" | "firetruck" | "creature";

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

export interface HouseParams {
  width: 6 | 8 | 10;
  roofStyle: "gable" | "flat";
  colors: { base: ColorId; walls: ColorId; windows: ColorId; roof: ColorId };
}
export interface FiretruckParams {
  ladderLength: 6 | 8 | 10;
  colors: { body: ColorId; chassis: ColorId; ladder: ColorId; windows: ColorId };
}
export interface CreatureParams {
  bodyLength: 2 | 3 | 4 | 5;
  colors: { body: ColorId; head: ColorId; spine: ColorId; legs: ColorId };
}

export type DesignParams =
  | ({ template: "house" } & HouseParams)
  | ({ template: "firetruck" } & FiretruckParams)
  | ({ template: "creature" } & CreatureParams);

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
