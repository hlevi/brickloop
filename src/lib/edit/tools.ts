import { COLORS, isColorId } from "../catalog/colors";
import { getKit } from "../model/templates";
import { isMosaicSize, isValidCells, resampleCells } from "../model/mosaic";
import { getCard } from "../cards/catalog";
import type { DesignParams, TemplateId } from "../model/types";

export type ToolName = "set_color" | "set_option" | "set_mosaic" | "set_card";

/** Longest cover headline (it is printed in large type on a 6 in card). */
export const HEADLINE_MAX = 40;

/** Trim, collapse whitespace and drop control and markup characters. Returns null when nothing printable is left. */
export function cleanHeadline(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, HEADLINE_MAX) : null;
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export type ToolResult = { ok: true; params: DesignParams; summary: string } | { ok: false; error: string };

/** Allowed colors per component for a kit (used by the UI and the planners). */
export function colorOptions(template: TemplateId): Record<string, string[]> {
  return Object.fromEntries(getKit(template).components.map((c) => [c.id, c.allowed]));
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
    // Changing a mosaic's size resamples its picture so nothing is lost by accident.
    if (kit.id === "mosaic" && opt.id === "size" && next.mosaic) {
      const from = Number(params.options.size), to = Number(val.id);
      if (isMosaicSize(from) && isMosaicSize(to)) next.mosaic = { cells: resampleCells(next.mosaic.cells, from, to) };
    }
    next.options[opt.id] = val.id;
    return { ok: true, params: next, summary: `${opt.label.toLowerCase()} set to ${val.label}` };
  }
  if (call.name === "set_mosaic") {
    if (kit.id !== "mosaic") return { ok: false, error: "Only mosaics have a picture to paint." };
    const size = Number(next.options.size ?? kit.options.find((o) => o.id === "size")!.default);
    if (!isValidCells(input.cells, size)) return { ok: false, error: `The picture must be ${size} x ${size} cells in mosaic colors.` };
    next.mosaic = { cells: input.cells };
    return { ok: true, params: next, summary: "mosaic picture updated" };
  }
  if (call.name === "set_card") {
    if (!next.card) return { ok: false, error: "This design is not a card." };
    const card = getCard(next.card.cardId);
    if (!card) return { ok: false, error: "Unknown card." };
    const changed: string[] = [];
    if (input.headline !== undefined) {
      const h = cleanHeadline(input.headline);
      if (!h) return { ok: false, error: "The cover headline can't be empty." };
      next.card = { ...next.card, headline: h };
      changed.push(`headline "${h}"`);
    }
    if (input.theme !== undefined) {
      if (typeof input.theme !== "string" || !card.cover.themes.includes(input.theme)) return { ok: false, error: `Choose one of this card's cover themes.` };
      next.card = { ...next.card, theme: input.theme };
      changed.push(`theme ${input.theme}`);
    }
    if (!changed.length) return { ok: false, error: "Nothing to change on the cover." };
    return { ok: true, params: next, summary: `cover ${changed.join(", ")}` };
  }
  return { ok: false, error: `Unknown edit "${call.name}".` };
}

/** Most tool calls accepted in one request (a full personalization is about a dozen). */
export const MAX_CALLS_PER_REQUEST = 24;

/** Shape-check tool calls from a request body. Arguments are validated later by applyTool. */
export function parseToolCalls(v: unknown, max = MAX_CALLS_PER_REQUEST): ToolCall[] | null {
  if (!Array.isArray(v) || v.length > max) return null;
  return v.map((c: unknown) => {
    const o = (c ?? {}) as Record<string, unknown>;
    return { name: String(o.name ?? ""), input: (o.input && typeof o.input === "object" ? o.input : {}) as Record<string, unknown> };
  });
}
