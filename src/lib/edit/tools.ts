import { COLORS, isColorId } from "../catalog/colors";
import { getKit } from "../model/templates";
import type { DesignParams, TemplateId } from "../model/types";

export type ToolName = "set_color" | "set_option";

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export type ToolResult = { ok: true; params: DesignParams; summary: string } | { ok: false; error: string };

/** Allowed colors per component for a kit (used by the UI and the planners). */
export function colorOptions(template: TemplateId): Record<string, string[]> {
  return Object.fromEntries(getKit(template).components.map((c) => [c.id, c.allowed]));
}

/** JSON schemas offered to the LLM. Arguments are re-validated below regardless. */
export function toolDefinitions(template: TemplateId) {
  const kit = getKit(template);
  const allColors = [...new Set(kit.components.flatMap((c) => c.allowed))];
  const defs: { name: string; description: string; input_schema: Record<string, unknown> & { type: "object" } }[] = [
    {
      name: "set_color",
      description: `Change the color of one component. Components: ${kit.components.map((c) => c.id).join(", ")}. Each component allows only certain colors; see the system prompt.`,
      input_schema: {
        type: "object",
        properties: { component: { type: "string", enum: kit.components.map((c) => c.id) }, color: { type: "string", enum: allColors } },
        required: ["component", "color"],
        additionalProperties: false,
      },
    },
  ];
  if (kit.options.length) {
    defs.push({
      name: "set_option",
      description: `Change a build option. Options: ${kit.options.map((o) => `${o.id} (${o.values.map((v) => v.id).join("|")})`).join("; ")}.`,
      input_schema: {
        type: "object",
        properties: { option: { type: "string", enum: kit.options.map((o) => o.id) }, value: { type: "string", enum: [...new Set(kit.options.flatMap((o) => o.values.map((v) => v.id)))] } },
        required: ["option", "value"],
        additionalProperties: false,
      },
    });
  }
  return defs;
}

/** Deterministically validate and apply one tool call. Never trusts the caller's arguments. */
export function applyTool(params: DesignParams, call: ToolCall): ToolResult {
  let kit;
  try {
    kit = getKit(params.template);
  } catch {
    return { ok: false, error: "Unknown model." };
  }
  const input = call.input ?? {};
  const next: DesignParams = structuredClone(params);
  if (call.name === "set_color") {
    const comp = kit.components.find((c) => c.id === input.component);
    if (!comp) return { ok: false, error: `Unknown component "${String(input.component)}". Choose one of: ${kit.components.map((c) => c.id).join(", ")}.` };
    if (!isColorId(input.color)) return { ok: false, error: `Unknown color "${String(input.color)}".` };
    if (!comp.allowed.includes(input.color))
      return { ok: false, error: `${COLORS[input.color].name} is not available for ${comp.label.toLowerCase()}. Options: ${comp.allowed.map((c) => COLORS[c].name).join(", ")}.` };
    next.colors[comp.id] = input.color;
    return { ok: true, params: next, summary: `${comp.label.toLowerCase()} set to ${COLORS[input.color].name}` };
  }
  if (call.name === "set_option") {
    const opt = kit.options.find((o) => o.id === input.option);
    if (!opt) return { ok: false, error: kit.options.length ? `Unknown option "${String(input.option)}". Choose one of: ${kit.options.map((o) => o.id).join(", ")}.` : "This model has no build options." };
    const val = opt.values.find((v) => v.id === input.value);
    if (!val) return { ok: false, error: `${opt.label} must be one of: ${opt.values.map((v) => v.label).join(", ")}.` };
    next.options[opt.id] = val.id;
    return { ok: true, params: next, summary: `${opt.label.toLowerCase()} set to ${val.label}` };
  }
  return { ok: false, error: `Unknown edit "${call.name}".` };
}

export function supportedEditsText(template: TemplateId): string {
  const kit = getKit(template);
  const opts = kit.options.map((o) => `${o.label.toLowerCase()} (${o.values.map((v) => v.label).join(" or ")})`);
  return `change colors (${kit.components.map((c) => c.label.toLowerCase()).join(", ")})${opts.length ? ` and ${opts.join(", ")}` : ""}`;
}
