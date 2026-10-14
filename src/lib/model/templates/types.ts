import type { ColorId } from "../../catalog/colors";
import type { Blueprint } from "../kit";
import type { BuildStep, DesignParams, PlacedPart } from "../types";

export type AgeBand = "4+" | "6+" | "7+" | "8+" | "9+" | "12+";

export interface KitOption {
  id: string;
  label: string;
  values: { id: string; label: string; synonyms?: string[] }[];
  default: string;
  /** Values are ordered small -> large, so "bigger"/"smaller" can step through them. */
  ordered?: boolean;
  synonyms?: string[];
}

export interface KitComponent {
  id: string;
  label: string;
  default: ColorId;
  allowed: ColorId[];
  synonyms?: string[];
}

export interface KitDef {
  id: string;
  name: string;
  version: string;
  ageBand: AgeBand;
  /** Product category it is modeled on (not a copy of any specific set). */
  category: string;
  description: string;
  components: KitComponent[];
  options: KitOption[];
  /** Layered voxel blueprint, compiled by model/kit.ts. Every kit has this or `build`. */
  blueprint?(options: Record<string, string>): Blueprint;
  /** Direct builder for kits that are not voxel blueprints (mosaics). */
  build?(options: Record<string, string>, colors: Record<string, ColorId>, params: DesignParams): { parts: PlacedPart[]; steps: BuildStep[] };
}
