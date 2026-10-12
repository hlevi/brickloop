import { COLORS, resolveColorName } from "../catalog/colors";
import { CREATURE_LENGTHS } from "../model/templates/creature";
import { LADDER_LENGTHS } from "../model/templates/firetruck";
import { HOUSE_WIDTHS } from "../model/templates/house";
import type { DesignParams } from "../model/types";
import { COLOR_OPTIONS, SUPPORTED_EDITS_TEXT, type ToolCall } from "./tools";

export interface ChatPlan {
  calls: ToolCall[];
  /** A clarifying question or explanation when no (or not all) edits can be made. */
  reply: string | null;
  /** "undo" / "reset" requests are handled by the design service. */
  control?: "undo" | "reset";
}

const COMPONENT_SYNONYMS: Record<string, string[]> = {
  base: ["base", "baseplate", "ground", "grass", "floor", "plate"],
  walls: ["wall", "walls", "house body", "bricks"],
  windows: ["window", "windows", "glass", "windshield"],
  roof: ["roof", "rooftop", "tiles", "shingles"],
  body: ["body", "truck", "cab", "segments", "segment"],
  chassis: ["chassis", "frame", "underside", "bottom"],
  ladder: ["ladder"],
  head: ["head", "face"],
  spine: ["spine", "back", "stripe"],
  legs: ["legs", "leg", "feet", "foot"],
};

const UNSUPPORTED = /\b(garage|chimney|second (floor|story)|balcony|door colou?r|garden|fence|wings?|tail|siren|hose|wheels? colou?r|add|remove|bigger windows?|taller|height)\b/i;

/** Find palette colors mentioned in text, longest names first so "dark bluish gray" beats "gray". */
function findColors(text: string): { color: string; index: number }[] {
  const names = new Set<string>();
  for (const c of Object.values(COLORS)) {
    names.add(c.name.toLowerCase());
    names.add(c.id.replace(/-/g, " "));
  }
  ["grey", "gray", "light gray", "light grey", "dark gray", "dark grey", "brown", "clear", "transparent", "light blue", "beige"].forEach((n) => names.add(n));
  const sorted = [...names].sort((a, b) => b.length - a.length);
  const found: { color: string; index: number }[] = [];
  let t = text.toLowerCase();
  for (const n of sorted) {
    const re = new RegExp(`\\b${n.replace(/[-]/g, "[- ]")}\\b`, "i");
    const m = re.exec(t);
    if (m) {
      const id = resolveColorName(n);
      if (id) found.push({ color: id, index: m.index });
      t = t.slice(0, m.index) + " ".repeat(m[0].length) + t.slice(m.index + m[0].length);
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

function findComponents(text: string, template: DesignParams["template"]): { component: string; index: number }[] {
  const valid = Object.keys(COLOR_OPTIONS[template]);
  const out: { component: string; index: number }[] = [];
  for (const comp of valid) {
    for (const syn of COMPONENT_SYNONYMS[comp] ?? [comp]) {
      const m = new RegExp(`\\b${syn}\\b`, "i").exec(text);
      if (m) {
        out.push({ component: comp, index: m.index });
        break;
      }
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

function stepThrough<T extends number>(options: readonly T[], current: T, dir: 1 | -1): T | null {
  const i = options.indexOf(current) + dir;
  return i >= 0 && i < options.length ? options[i] : null;
}

/** Credential-free conversational editing: a rule-based planner producing the same tool calls as the LLM path. */
export function planFromMessage(message: string, params: DesignParams): ChatPlan {
  const text = message.trim();
  const lower = text.toLowerCase();
  if (/^\s*undo\b/.test(lower)) return { calls: [], reply: null, control: "undo" };
  if (/^\s*(reset|start over)\b/.test(lower)) return { calls: [], reply: null, control: "reset" };

  const calls: ToolCall[] = [];
  const notes: string[] = [];
  const more = /\b(wider|bigger|longer|larger|extend|more)\b/.test(lower);
  const less = /\b(narrower|smaller|shorter|less|fewer)\b/.test(lower);
  const num = (() => {
    const m = /\b(\d{1,2})\b/.exec(lower);
    return m ? Number(m[1]) : null;
  })();

  if (params.template === "house") {
    if (/\bflat\b/.test(lower)) calls.push({ name: "set_roof_style", input: { style: "flat" } });
    else if (/\b(gable|pointed|peaked|sloped|slanted|triangle)\b/.test(lower)) calls.push({ name: "set_roof_style", input: { style: "gable" } });
    if (/\b(width|wide|wider|narrower|studs?)\b/.test(lower) || (/\b(bigger|smaller|larger)\b/.test(lower) && !/\b(window|door)/.test(lower))) {
      if (num !== null) calls.push({ name: "set_house_width", input: { width: num } });
      else if (more || less) {
        const next = stepThrough(HOUSE_WIDTHS, params.width, more ? 1 : -1);
        if (next) calls.push({ name: "set_house_width", input: { width: next } });
        else notes.push(`The house is already at its ${more ? "widest" : "narrowest"} supported width (${params.width} studs).`);
      }
    }
  }
  if (params.template === "firetruck" && /\bladder\b/.test(lower)) {
    if (num !== null) calls.push({ name: "set_ladder_length", input: { length: num } });
    else if (more || less) {
      const next = stepThrough(LADDER_LENGTHS, params.ladderLength, more ? 1 : -1);
      if (next) calls.push({ name: "set_ladder_length", input: { length: next } });
      else notes.push(`The ladder is already at its ${more ? "longest" : "shortest"} supported length (${params.ladderLength} studs).`);
    }
  }
  if (params.template === "creature" && /\b(long|longer|shorter|segments?|length|body length)\b/.test(lower) && !findColors(lower).length) {
    if (num !== null) calls.push({ name: "set_creature_length", input: { segments: num } });
    else if (more || less) {
      const next = stepThrough(CREATURE_LENGTHS, params.bodyLength, more ? 1 : -1);
      if (next) calls.push({ name: "set_creature_length", input: { segments: next } });
      else notes.push(`The creature is already at its ${more ? "longest" : "shortest"} supported length (${params.bodyLength} segments).`);
    }
  }

  // Colors: pair each color with the nearest preceding/following component mention.
  const colors = findColors(text);
  const comps = findComponents(text, params.template);
  if (colors.length) {
    if (comps.length === 0) {
      const options = Object.keys(COLOR_OPTIONS[params.template]);
      return {
        calls,
        reply: `Which part should be ${colors.map((c) => COLORS[c.color].name).join(" / ")}? You can choose: ${options.join(", ")}.`,
      };
    }
    if (colors.length === 1) {
      for (const comp of comps) calls.push({ name: "set_color", input: { component: comp.component, color: colors[0].color } });
    } else {
      for (const comp of comps) {
        const nearest = colors.reduce((best, c) => (Math.abs(c.index - comp.index) < Math.abs(best.index - comp.index) ? c : best));
        calls.push({ name: "set_color", input: { component: comp.component, color: nearest.color } });
      }
    }
  } else if (/\b(colou?r|paint|make it)\b/.test(lower) && comps.length) {
    return { calls, reply: `Which color would you like for the ${comps.map((c) => c.component).join(" and ")}?` };
  }

  if (UNSUPPORTED.test(lower) && calls.length === 0) {
    return { calls, reply: `That change isn't supported yet. For this model I can ${SUPPORTED_EDITS_TEXT[params.template]}.` };
  }
  if (calls.length === 0) {
    return { calls, reply: notes.length ? notes.join(" ") : `I didn't find a change I can make. For this model I can ${SUPPORTED_EDITS_TEXT[params.template]}.` };
  }
  return { calls, reply: notes.length ? notes.join(" ") : null };
}
