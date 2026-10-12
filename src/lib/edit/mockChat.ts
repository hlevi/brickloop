import { COLORS, resolveColorName } from "../catalog/colors";
import { getKit } from "../model/templates";
import type { DesignParams } from "../model/types";
import { supportedEditsText, type ToolCall } from "./tools";

export interface ChatPlan {
  calls: ToolCall[];
  /** A clarifying question or explanation when no (or not all) edits can be made. */
  reply: string | null;
  /** "undo" / "reset" requests are handled by the design service. */
  control?: "undo" | "reset";
}

const UNSUPPORTED = /\b(add|remove|garage|second (floor|story)|balcony|wings?|bigger windows?|from (a|this) (photo|picture|image)|minifig|people|person)\b/i;

/** Find palette colors mentioned in text, longest names first so "dark bluish gray" beats "gray". */
function findColors(text: string): { color: string; index: number }[] {
  const names = new Set<string>();
  for (const c of Object.values(COLORS)) {
    names.add(c.name.toLowerCase());
    names.add(c.id.replace(/-/g, " "));
  }
  ["grey", "gray", "light gray", "light grey", "dark gray", "dark grey", "brown", "clear", "transparent", "light blue", "beige", "pink", "dark green"].forEach((n) => names.add(n));
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

const word = (w: string) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");

/** Credential-free conversational editing: a rule-based planner producing the same tool calls as the LLM path. */
export function planFromMessage(message: string, params: DesignParams): ChatPlan {
  const kit = getKit(params.template);
  const text = message.trim();
  const lower = text.toLowerCase();
  if (/^\s*undo\b/.test(lower)) return { calls: [], reply: null, control: "undo" };
  if (/^\s*(reset|start over)\b/.test(lower)) return { calls: [], reply: null, control: "reset" };

  const calls: ToolCall[] = [];
  const notes: string[] = [];
  const colors = findColors(text);
  // Text with color words blanked out, so "orange" the color doesn't trigger option words.
  let rest = lower;
  for (const c of [...Object.values(COLORS).map((c) => c.name.toLowerCase())].sort((a, b) => b.length - a.length)) rest = rest.split(c).join(" ");

  // Options: explicit value synonyms first, then ordered "bigger/smaller" requests.
  for (const opt of kit.options) {
    let picked: string | null = null;
    // Longest synonyms first so "no chimney" beats "chimney".
    const cands = opt.values.flatMap((v) => [v.label.toLowerCase(), ...(v.synonyms ?? [])].map((s) => ({ v: v.id, s })));
    cands.sort((a, b) => b.s.length - a.s.length);
    for (const c of cands) {
      if (word(c.s).test(rest)) {
        picked = c.v;
        break;
      }
    }
    if (!picked && opt.ordered && (opt.synonyms ?? []).some((s) => word(s).test(rest))) {
      const num = /\b(\d{1,2})\b/.exec(rest);
      if (num && opt.values.some((v) => v.id === num[1])) picked = num[1];
      else {
        const more = /\b(bigger|larger|longer|taller|wider|more|extend)\b/.test(rest);
        const less = /\b(smaller|shorter|narrower|less|fewer)\b/.test(rest);
        if (more || less) {
          const i = opt.values.findIndex((v) => v.id === params.options[opt.id]) + (more ? 1 : -1);
          if (i >= 0 && i < opt.values.length) picked = opt.values[i].id;
          else notes.push(`${opt.label} is already at its ${more ? "largest" : "smallest"} setting.`);
        }
      }
    }
    if (picked && picked !== params.options[opt.id]) calls.push({ name: "set_option", input: { option: opt.id, value: picked } });
  }

  // Colors: pair each color with the nearest component mention.
  const comps = kit.components
    .map((c) => {
      for (const s of [c.label.toLowerCase(), c.id, ...(c.synonyms ?? [])]) {
        const m = word(s).exec(lower);
        if (m) return { component: c.id, index: m.index };
      }
      return null;
    })
    .filter((c): c is { component: string; index: number } => c !== null);
  if (colors.length) {
    if (comps.length === 0) {
      return { calls, reply: `Which part should be ${colors.map((c) => COLORS[c.color].name).join(" / ")}? You can choose: ${kit.components.map((c) => c.label.toLowerCase()).join(", ")}.` };
    }
    for (const comp of comps) {
      const nearest = colors.reduce((best, c) => (Math.abs(c.index - comp.index) < Math.abs(best.index - comp.index) ? c : best));
      calls.push({ name: "set_color", input: { component: comp.component, color: nearest.color } });
    }
  } else if (/\b(colou?r|paint)\b/.test(lower) && comps.length) {
    return { calls, reply: `Which color would you like for the ${comps.map((c) => c.component).join(" and ")}?` };
  }

  if (calls.length === 0) {
    if (notes.length) return { calls, reply: notes.join(" ") };
    if (UNSUPPORTED.test(lower)) return { calls, reply: `That change isn't supported yet. For this model I can ${supportedEditsText(kit.id)}.` };
    return { calls, reply: `I didn't find a change I can make. For this model I can ${supportedEditsText(kit.id)}.` };
  }
  return { calls, reply: notes.length ? notes.join(" ") : null };
}
