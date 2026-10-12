import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { COLORS } from "../catalog/colors";
import { computeBom, type Bom } from "../bom/bom";
import type { MappingLookup } from "../catalog/mappings";
import type { DesignModel, PlacedPart } from "../model/types";
import type { ValidationResult } from "../validation/validate";
import { renderIso, type Rendered } from "./iso";
import { stepParts } from "./steps";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;

function hexColor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Draw a render into the box (x, y = bottom-left in PDF space). */
function drawRender(page: PDFPage, r: Rendered, box: { x: number; y: number; w: number; h: number }, font: PDFFont) {
  const pad = 0.6;
  const vw = r.maxX - r.minX + 2 * pad;
  const vh = r.maxY - r.minY + 2 * pad;
  const s = Math.min(box.w / vw, box.h / vh);
  const offX = box.x + (box.w - vw * s) / 2;
  const offTop = box.y + box.h - (box.h - vh * s) / 2; // PDF y of the render's top edge
  const tx = (px: number) => offX + (px - r.minX + pad) * s;
  const ty = (py: number) => offTop - (py - r.minY + pad) * s;
  for (const op of r.ops) {
    if (op.kind === "poly") {
      const d = op.points.map((p, i) => `${i ? "L" : "M"}${(tx(p[0]) - offX).toFixed(2)},${(offTop - ty(p[1])).toFixed(2)}`).join(" ") + " Z";
      page.drawSvgPath(d, { x: offX, y: offTop, color: hexColor(op.fill), opacity: op.opacity ?? 1, borderColor: hexColor(op.fill), borderWidth: 0.15 });
    } else if (op.kind === "line") {
      page.drawLine({ start: { x: tx(op.a[0]), y: ty(op.a[1]) }, end: { x: tx(op.b[0]), y: ty(op.b[1]) }, thickness: Math.max(0.2, op.width * s), color: hexColor(op.stroke) });
    } else if (op.kind === "text") {
      const size = op.size * s;
      const w = font.widthOfTextAtSize(op.text, size);
      const x = op.anchor === "middle" ? tx(op.at[0]) - w / 2 : op.anchor === "end" ? tx(op.at[0]) - w : tx(op.at[0]);
      page.drawText(op.text, { x, y: ty(op.at[1]), size, font, color: hexColor(op.fill) });
    } else if (op.kind === "arrow") {
      const a = { x: tx(op.from[0]), y: ty(op.from[1]) };
      const b = { x: tx(op.to[0]), y: ty(op.to[1]) };
      page.drawLine({ start: a, end: b, thickness: op.width * s, color: hexColor(op.stroke) });
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const hl = 0.45 * s;
      const p1 = { x: b.x - hl * Math.cos(ang - 0.45), y: b.y - hl * Math.sin(ang - 0.45) };
      const p2 = { x: b.x - hl * Math.cos(ang + 0.45), y: b.y - hl * Math.sin(ang + 0.45) };
      const d = `M${b.x},${-b.y} L${p1.x},${-p1.y} L${p2.x},${-p2.y} Z`;
      page.drawSvgPath(d, { x: 0, y: 0, color: hexColor(op.stroke) });
    }
  }
}

/** A single part rendered at the origin, for parts callouts. */
export function renderSinglePart(partId: string, colorId: string): Rendered {
  const p: PlacedPart = { uid: "x", partId, colorId: colorId as PlacedPart["colorId"], x: 0, y: 0, z: 0, rot: 0, component: "", step: 1 };
  return renderIso([p]);
}

export interface InstructionOptions {
  title: string;
  /** Shown on every page: "SIMULATION" or "LIVE ORDER". */
  modeLabel: string;
  validation: ValidationResult;
  lookup?: MappingLookup;
  revisionLabel?: string;
}

export async function generateInstructionsPdf(model: DesignModel, opts: InstructionOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${opts.title} - BrickLoop building instructions`);
  doc.setProducer("BrickLoop");
  doc.setCreator("BrickLoop instruction renderer");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const bom: Bom = computeBom(model, opts.lookup);
  const totalPages = 2 + model.steps.length;
  let pageNo = 0;

  const newPage = () => {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    pageNo++;
    page.drawText(`BrickLoop  |  ${opts.title}${opts.revisionLabel ? `  |  ${opts.revisionLabel}` : ""}`, { x: MARGIN, y: PAGE_H - 24, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(opts.modeLabel, { x: PAGE_W - MARGIN - bold.widthOfTextAtSize(opts.modeLabel, 8), y: PAGE_H - 24, size: 8, font: bold, color: rgb(0.75, 0.1, 0.1) });
    page.drawText(`${pageNo} / ${totalPages}`, { x: PAGE_W / 2 - 10, y: 18, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
    return page;
  };

  // Cover.
  {
    const page = newPage();
    page.drawText(opts.title, { x: MARGIN, y: PAGE_H - 80, size: 28, font: bold });
    page.drawText(`${bom.totalPieces} pieces  |  ${model.steps.length} steps  |  ${model.templateVersion}`, { x: MARGIN, y: PAGE_H - 104, size: 11, font });
    drawRender(page, renderIso(model.parts, { showFrontCue: true }), { x: MARGIN, y: 200, w: PAGE_W - 2 * MARGIN, h: PAGE_H - 340 }, bold);
    const v = opts.validation;
    const lines = [
      `Digital validation: ${v.status.toUpperCase()}${v.warnings.length ? ` (${v.warnings.length} warning(s))` : ""}`,
      `Physical test build: ${v.physicallyValidated ? "completed for this configuration" : "NOT YET PERFORMED for this configuration"}`,
      "Contains small parts. Not for children under 3 years.",
      "Original BrickLoop design. Built from genuine bricks sourced per order.",
    ];
    lines.forEach((t, i) => page.drawText(t, { x: MARGIN, y: 150 - i * 16, size: 10, font: i < 2 ? bold : font }));
  }

  // Parts list.
  {
    const page = newPage();
    page.drawText("Parts list", { x: MARGIN, y: PAGE_H - 70, size: 18, font: bold });
    const cols = 4;
    const cellW = (PAGE_W - 2 * MARGIN) / cols;
    const cellH = 92;
    bom.lines.forEach((l, i) => {
      const cx = MARGIN + (i % cols) * cellW;
      const cy = PAGE_H - 100 - Math.floor(i / cols) * cellH - cellH;
      drawRender(page, renderSinglePart(l.partId, l.colorId), { x: cx + 4, y: cy + 28, w: cellW - 8, h: cellH - 32 }, bold);
      page.drawText(`${l.quantity}x`, { x: cx + 6, y: cy + 16, size: 11, font: bold });
      page.drawText(trim(`${l.partName}`, 30), { x: cx + 30, y: cy + 17, size: 6.5, font });
      page.drawText(trim(`${l.colorName}`, 30), { x: cx + 30, y: cy + 8, size: 6.5, font, color: rgb(0.35, 0.35, 0.35) });
    });
  }

  // Steps.
  for (const step of model.steps) {
    const page = newPage();
    page.drawText(`Step ${step.index}`, { x: MARGIN, y: PAGE_H - 70, size: 22, font: bold });
    page.drawText(step.title, { x: MARGIN, y: PAGE_H - 90, size: 12, font });
    if (step.note) page.drawText(step.note, { x: MARGIN, y: PAGE_H - 106, size: 10, font, color: rgb(0.2, 0.2, 0.5) });

    // Parts needed for this step (callout box).
    const needed = stepParts(model, step.index);
    const boxW = PAGE_W - 2 * MARGIN;
    const itemW = 92;
    const perRow = Math.floor((boxW - 16) / itemW);
    const rows = Math.ceil(needed.length / perRow);
    const boxH = 20 + rows * 70;
    const boxTop = PAGE_H - 120;
    page.drawRectangle({ x: MARGIN, y: boxTop - boxH, width: boxW, height: boxH, borderColor: rgb(0.2, 0.4, 0.8), borderWidth: 1, color: rgb(0.95, 0.97, 1) });
    page.drawText("Parts for this step", { x: MARGIN + 8, y: boxTop - 14, size: 9, font: bold, color: rgb(0.2, 0.4, 0.8) });
    needed.forEach((n, i) => {
      const ix = MARGIN + 8 + (i % perRow) * itemW;
      const iy = boxTop - 20 - (Math.floor(i / perRow) + 1) * 70;
      drawRender(page, renderSinglePart(n.partId, n.colorId), { x: ix, y: iy + 14, w: itemW - 14, h: 52 }, bold);
      page.drawText(`${n.quantity}x  ${trim(COLORS[n.colorId]?.name ?? n.colorId, 16)}`, { x: ix + 2, y: iy + 4, size: 7.5, font: bold });
    });

    const r = renderIso(model.parts, { uptoStep: step.index, highlightStep: step.index, showFrontCue: true });
    drawRender(page, r, { x: MARGIN, y: 40, w: PAGE_W - 2 * MARGIN, h: boxTop - boxH - 60 }, bold);
  }

  return doc.save();
}

function trim(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "." : s;
}

