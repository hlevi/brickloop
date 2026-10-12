import { compileBlueprint } from "../kit";
import type { ComponentDef, DesignModel, DesignParams, TemplateId } from "../types";
import type { KitDef } from "./types";
import { PUP } from "./pup";
import { RACER } from "./racer";
import { DINO } from "./dino";
import { COTTAGE } from "./cottage";
import { ROCKET } from "./rocket";
import { BONSAI } from "./bonsai";
import { CREATURE, NAME_PLACEHOLDER } from "./creature";
import { renderName } from "../../creature/words";

export type { KitDef, KitOption, KitComponent, AgeBand } from "./types";

/** Original BrickLoop kits, ordered by age band. The Creature Lab kit is kid-mode only. */
export const KITS: KitDef[] = [PUP, RACER, DINO, COTTAGE, ROCKET, BONSAI, CREATURE];

/** Ready-made kits shown in the grown-up gallery (excludes Lab kits). */
export const READY_MADE_KITS: KitDef[] = KITS.filter((k) => !k.lab);

export interface TemplateInfo {
  id: TemplateId;
  name: string;
  description: string;
  ageBand: string;
  category: string;
  adjustable: string[];
}

export const TEMPLATES: TemplateInfo[] = READY_MADE_KITS.map((k) => ({
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

export function isLabKit(template: string): boolean {
  return KITS.find((k) => k.id === template)?.lab === true;
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
  const compiled = compileBlueprint(k.blueprint(options), colors);
  const parts = compiled.parts;
  // Personalize step notes for Lab kits ("click Captain Fizzfang's power core into place").
  const steps = k.lab ? compiled.steps.map((s) => (s.note ? { ...s, note: s.note.split(NAME_PLACEHOLDER).join(renderName(params.identity)) } : s)) : compiled.steps;
  const components: ComponentDef[] = k.components.map((c) => ({ id: c.id, label: c.label, colorId: colors[c.id], allowedColors: c.allowed }));
  const optKey = k.options.map((o) => `${o.id}=${options[o.id]}`).join(",");
  return {
    template: k.id,
    templateVersion: `${k.id}-${k.version}`,
    params: params.identity ? { template: k.id, colors, options, identity: params.identity } : { template: k.id, colors, options },
    parts,
    components,
    steps,
    structuralKey: `${k.id}-${k.version}:${optKey}`,
  };
}
