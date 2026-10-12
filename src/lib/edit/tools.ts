import { COLORS, isColorId } from "../catalog/colors";
import { CREATURE_COLOR_OPTIONS, CREATURE_LENGTHS } from "../model/templates/creature";
import { FIRETRUCK_COLOR_OPTIONS, LADDER_LENGTHS } from "../model/templates/firetruck";
import { HOUSE_COLOR_OPTIONS, HOUSE_WIDTHS, ROOF_STYLES } from "../model/templates/house";
import type { DesignParams, TemplateId } from "../model/types";

export type ToolName = "set_color" | "set_house_width" | "set_roof_style" | "set_ladder_length" | "set_creature_length";

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export type ToolResult = { ok: true; params: DesignParams; summary: string } | { ok: false; error: string };

export const COLOR_OPTIONS: Record<TemplateId, Record<string, string[]>> = {
  house: HOUSE_COLOR_OPTIONS,
  firetruck: FIRETRUCK_COLOR_OPTIONS,
  creature: CREATURE_COLOR_OPTIONS,
};

const TOOL_TEMPLATES: Record<ToolName, TemplateId[]> = {
  set_color: ["house", "firetruck", "creature"],
  set_house_width: ["house"],
  set_roof_style: ["house"],
  set_ladder_length: ["firetruck"],
  set_creature_length: ["creature"],
};

/** JSON schemas offered to the LLM. Arguments are re-validated below regardless. */
export function toolDefinitions(template: TemplateId) {
  const comps = Object.keys(COLOR_OPTIONS[template]);
  const allColors = [...new Set(Object.values(COLOR_OPTIONS[template]).flat())];
  const defs = [
    {
      name: "set_color",
      description: `Change the color of one component. Components: ${comps.join(", ")}. Each component only allows certain colors; see the system prompt.`,
      input_schema: {
        type: "object" as const,
        properties: { component: { type: "string", enum: comps }, color: { type: "string", enum: allColors } },
        required: ["component", "color"],
        additionalProperties: false,
      },
    },
    {
      name: "set_house_width",
      description: "Set the house width in studs.",
      input_schema: { type: "object" as const, properties: { width: { type: "integer", enum: [...HOUSE_WIDTHS] } }, required: ["width"], additionalProperties: false },
    },
    {
      name: "set_roof_style",
      description: "Set the house roof style.",
      input_schema: { type: "object" as const, properties: { style: { type: "string", enum: [...ROOF_STYLES] } }, required: ["style"], additionalProperties: false },
    },
    {
      name: "set_ladder_length",
      description: "Set the fire truck ladder length in studs.",
      input_schema: { type: "object" as const, properties: { length: { type: "integer", enum: [...LADDER_LENGTHS] } }, required: ["length"], additionalProperties: false },
    },
    {
      name: "set_creature_length",
      description: "Set the number of creature body segments.",
      input_schema: { type: "object" as const, properties: { segments: { type: "integer", enum: [...CREATURE_LENGTHS] } }, required: ["segments"], additionalProperties: false },
    },
  ];
  return defs.filter((d) => TOOL_TEMPLATES[d.name as ToolName].includes(template));
}

/** Deterministically validate and apply one tool call. Never trusts the caller's arguments. */
export function applyTool(params: DesignParams, call: ToolCall): ToolResult {
  const name = call.name as ToolName;
  if (!(name in TOOL_TEMPLATES)) return { ok: false, error: `Unknown edit "${call.name}".` };
  if (!TOOL_TEMPLATES[name].includes(params.template)) return { ok: false, error: `"${call.name}" does not apply to the ${params.template} model.` };
  const input = call.input ?? {};
  const next = structuredClone(params) as DesignParams;
  switch (name) {
    case "set_color": {
      const component = input.component;
      const color = input.color;
      const options = COLOR_OPTIONS[params.template];
      if (typeof component !== "string" || !(component in options)) return { ok: false, error: `Unknown component "${String(component)}". Choose one of: ${Object.keys(options).join(", ")}.` };
      if (!isColorId(color)) return { ok: false, error: `Unknown color "${String(color)}".` };
      if (!options[component].includes(color))
        return { ok: false, error: `${COLORS[color].name} is not available for ${component}. Options: ${options[component].map((c) => COLORS[c].name).join(", ")}.` };
      (next.colors as Record<string, string>)[component] = color;
      return { ok: true, params: next, summary: `${component} set to ${COLORS[color].name}` };
    }
    case "set_house_width": {
      const w = input.width;
      if (next.template !== "house" || !HOUSE_WIDTHS.includes(w as never)) return { ok: false, error: `House width must be one of ${HOUSE_WIDTHS.join(", ")} studs.` };
      next.width = w as 6 | 8 | 10;
      return { ok: true, params: next, summary: `width set to ${w} studs` };
    }
    case "set_roof_style": {
      const s = input.style;
      if (next.template !== "house" || !ROOF_STYLES.includes(s as never)) return { ok: false, error: `Roof style must be one of: ${ROOF_STYLES.join(", ")}.` };
      next.roofStyle = s as "gable" | "flat";
      return { ok: true, params: next, summary: `roof set to ${s}` };
    }
    case "set_ladder_length": {
      const l = input.length;
      if (next.template !== "firetruck" || !LADDER_LENGTHS.includes(l as never)) return { ok: false, error: `Ladder length must be one of ${LADDER_LENGTHS.join(", ")} studs.` };
      next.ladderLength = l as 6 | 8 | 10;
      return { ok: true, params: next, summary: `ladder set to ${l} studs` };
    }
    case "set_creature_length": {
      const n = input.segments;
      if (next.template !== "creature" || !CREATURE_LENGTHS.includes(n as never)) return { ok: false, error: `Body length must be ${CREATURE_LENGTHS.join(", ")} segments.` };
      next.bodyLength = n as 2 | 3 | 4 | 5;
      return { ok: true, params: next, summary: `body set to ${n} segments` };
    }
  }
}

export const SUPPORTED_EDITS_TEXT: Record<TemplateId, string> = {
  house: "change colors (base, walls, windows, roof), width (6, 8 or 10 studs) and roof style (gable or flat)",
  firetruck: "change colors (body, chassis, ladder, windows) and ladder length (6, 8 or 10 studs)",
  creature: "change colors (body, head, spine, legs) and body length (2 to 5 segments)",
};
