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

/** Bounded customization: a color per component and a value per option. */
export interface DesignParams {
  template: TemplateId;
  colors: Record<string, ColorId>;
  options: Record<string, string>;
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
