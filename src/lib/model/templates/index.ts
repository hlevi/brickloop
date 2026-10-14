import { compileBlueprint } from "../kit";
import type { ComponentDef, DesignModel, DesignParams, TemplateId } from "../types";
import type { KitDef } from "./types";
import { PUP } from "./pup";
import { RACER } from "./racer";
import { DINO } from "./dino";
import { COTTAGE } from "./cottage";
import { ROCKET } from "./rocket";
import { BONSAI } from "./bonsai";
import { MOSAIC } from "./mosaic";
import { KITS_A } from "./group-a";
import { KITS_B } from "./group-b";
import { KITS_C } from "./group-c";

export type { KitDef, KitOption, KitComponent, AgeBand } from "./types";

/**
 * Every buildable model. Each greeting card in src/lib/cards points at one of these.
 * group-a/b/c hold the card builds (cake, heart, tree, ...); MOSAIC is the brick mosaic.
 */
export const KITS: KitDef[] = [PUP, RACER, DINO, COTTAGE, ROCKET, BONSAI, ...KITS_A, ...KITS_B, ...KITS_C, MOSAIC];

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
  const compiled = k.build ? k.build(options, colors, params) : compileBlueprint(k.blueprint!(options), colors);
  const components: ComponentDef[] = k.components.map((c) => ({ id: c.id, label: c.label, colorId: colors[c.id], allowedColors: c.allowed }));
  const optKey = k.options.map((o) => `${o.id}=${options[o.id]}`).join(",");
  const out: DesignParams = { template: k.id, colors, options };
  if (params.mosaic) out.mosaic = params.mosaic;
  if (params.card) out.card = params.card;
  return {
    template: k.id,
    templateVersion: `${k.id}-${k.version}`,
    params: out,
    parts: compiled.parts,
    components,
    steps: compiled.steps,
    structuralKey: `${k.id}-${k.version}:${optKey}`,
  };
}
