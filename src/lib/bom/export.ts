import type { Bom } from "./bom";

function csvCell(v: string | number | null): string {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function bomToCsv(bom: Bom): string {
  const header = ["part_id", "part_name", "color_id", "color_name", "quantity", "bricklink_item", "bricklink_color", "mapping_status"];
  const rows = bom.lines.map((l) =>
    [l.partId, l.partName, l.colorId, l.colorName, l.quantity, l.mapping.externalItemId, l.mapping.externalColorId, l.mapping.status].map(csvCell).join(","),
  );
  return [header.join(","), ...rows].join("\n") + "\n";
}

export type Condition = "N" | "U" | "X";

export class ExportBlockedError extends Error {
  constructor(public readonly unresolved: string[]) {
    super(`BrickLink XML export blocked: ${unresolved.length} line(s) lack a verified mapping`);
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * BrickLink Wanted List XML (INVENTORY/ITEM with ITEMTYPE, ITEMID, COLOR, MINQTY, CONDITION).
 * Requires verified mappings unless allowProvisional is set, in which case the
 * file carries a comment stating that identifiers are unverified.
 */
export function bomToBrickLinkXml(bom: Bom, opts: { condition?: Condition; allowProvisional?: boolean } = {}): string {
  const condition = opts.condition ?? "N";
  if (!["N", "U", "X"].includes(condition)) throw new Error(`Invalid condition ${condition}`);
  const missing = bom.lines.filter((l) => !l.mapping.externalItemId || l.mapping.externalColorId === null);
  if (missing.length) throw new ExportBlockedError(missing.map((l) => `${l.partId}/${l.colorId}`));
  const unverified = bom.lines.filter((l) => l.mapping.status !== "verified");
  if (unverified.length && !opts.allowProvisional) throw new ExportBlockedError(unverified.map((l) => `${l.partId}/${l.colorId}`));
  const items = bom.lines.map(
    (l) =>
      `  <ITEM>\n    <ITEMTYPE>P</ITEMTYPE>\n    <ITEMID>${esc(l.mapping.externalItemId!)}</ITEMID>\n    <COLOR>${l.mapping.externalColorId}</COLOR>\n    <MINQTY>${l.quantity}</MINQTY>\n    <CONDITION>${condition}</CONDITION>\n  </ITEM>`,
  );
  const note = unverified.length
    ? `<!-- WARNING: ${unverified.length} line(s) use PROVISIONAL identifiers not verified against the BrickLink catalog. Check before use. -->\n`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n${note}<INVENTORY>\n${items.join("\n")}\n</INVENTORY>\n`;
}
