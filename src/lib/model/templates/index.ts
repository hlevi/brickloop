import { compileBlueprint } from "../kit";
import type { ComponentDef, DesignModel, DesignParams, TemplateId } from "../types";
import type { KitDef } from "./types";
import { PUP } from "./pup";
import { RACER } from "./racer";
import { DINO } from "./dino";
import { COTTAGE } from "./cottage";
import { ROCKET } from "./rocket";
import { BONSAI } from "./bonsai";

export type { KitDef, KitOption, KitComponent, AgeBand } from "./types";

/** Original BrickLoop kits, ordered by age band. */
export const KITS: KitDef[] = [PUP, RACER, DINO, COTTAGE, ROCKET, BONSAI];

export interface TemplateInfo {
  id: TemplateId;
  name: string;
  description: string;
  ageBand: string;
  category: string;
  adjustable: string[];
}

export const TEMPLATES: TemplateInfo[] = KITS.map((k) => ({
  id: k.id,
  name: k.name,
  description: k.description,
  ageBand: k.ageBand,
  category: k.category,
  adjustable: [
    ...k.options.map((o) => `${o.label}: ${o.values.map((v) => v.label).join(" / ")}`),
    `Colors: ${k.components.map((c) => c.label.toLowerCase()).join(", ")}`,
  ],
}));

export function getKit(id: string): KitDef {
  const k = KITS.find((x) => x.id === id);
  if (!k) throw new Error(`Unknown kit ${id}`);
  return k;
}

export function isTemplateId(v: unknown): v is TemplateId {
  return typeof v === "string" && KITS.some((k) => k.id === v);
}

export function defaultParams(template: TemplateId): DesignParams {
  const k = getKit(template);
  return {
    template,
    colors: Object.fromEntries(k.components.map((c) => [c.id, c.default])),
    options: Object.fromEntries(k.options.map((o) => [o.id, o.default])),
  };
}

export function buildModel(params: DesignParams): DesignModel {
  const k = getKit(params.template);
  const options = { ...defaultParams(k.id).options, ...params.options };
  const colors = { ...defaultParams(k.id).colors, ...params.colors };
  const { parts, steps } = compileBlueprint(k.blueprint(options), colors);
  const components: ComponentDef[] = k.components.map((c) => ({ id: c.id, label: c.label, colorId: colors[c.id], allowedColors: c.allowed }));
  const optKey = k.options.map((o) => `${o.id}=${options[o.id]}`).join(",");
  return {
    template: k.id,
    templateVersion: `${k.id}-${k.version}`,
    params: { template: k.id, colors, options },
    parts,
    components,
    steps,
    structuralKey: `${k.id}-${k.version}:${optKey}`,
  };
}
