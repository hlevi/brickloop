import type { ColorId } from "../../catalog/colors";
import type { Blueprint } from "../kit";

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
  blueprint(options: Record<string, string>): Blueprint;
}
