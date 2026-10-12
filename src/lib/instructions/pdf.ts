import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { computeBom, type Bom } from "../bom/bom";
import type { MappingLookup } from "../catalog/mappings";
import type { DesignModel } from "../model/types";
import type { ValidationResult } from "../validation/validate";
import { drawCardPage, drawCreatureCover, drawPowerUpStep, embedPackFonts, type CreaturePackInfo, type PackContext } from "./creaturePages";
import { renderIso } from "./iso";
import { drawPartsCallout, drawRender, renderSinglePart, trim } from "./pdfDraw";

export { renderSinglePart } from "./pdfDraw";
export type { CreaturePackInfo } from "./creaturePages";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;

export interface InstructionOptions {
  title: string;
  /** Shown on every page: "SIMULATION" or "LIVE ORDER". */
  modeLabel: string;
  validation: ValidationResult;
  lookup?: MappingLookup;
  revisionLabel?: string;
  /**
   * Lab kits: turns the booklet into a personalized Creature Pack (keepsake
   * cover, cut-out card and certificate page, special final step). Only the
   * creature's own identity goes in here, never anything about the purchaser.
   */
  creature?: CreaturePackInfo;
}

export async function generateInstructionsPdf(model: DesignModel, opts: InstructionOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(opts.creature ? `${opts.title} - BrickLoop Creature Pack` : `${opts.title} - BrickLoop building instructions`);
  doc.setProducer("BrickLoop");
  doc.setCreator("BrickLoop instruction renderer");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const bom: Bom = computeBom(model, opts.lookup);
  const totalPages = 2 + (opts.creature ? 1 : 0) + model.steps.length;
  let pageNo = 0;

  const pack: PackContext | null = opts.creature
    ? {
        model,
        info: opts.creature,
        fonts: await embedPackFonts(doc, font, bold),
        validation: opts.validation,
        pieces: bom.totalPieces,
        pageW: PAGE_W,
        pageH: PAGE_H,
        margin: MARGIN,
      }
    : null;

  const newPage = () => {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    pageNo++;
    page.drawText(`BrickLoop  |  ${opts.title}${opts.revisionLabel ? `  |  ${opts.revisionLabel}` : ""}`, { x: MARGIN, y: PAGE_H - 24, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(opts.modeLabel, { x: PAGE_W - MARGIN - bold.widthOfTextAtSize(opts.modeLabel, 8), y: PAGE_H - 24, size: 8, font: bold, color: rgb(0.75, 0.1, 0.1) });
    page.drawText(`${pageNo} / ${totalPages}`, { x: PAGE_W / 2 - 10, y: 18, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
    return page;
  };

  // Cover.
  if (pack) {
    drawCreatureCover(newPage(), pack);
    drawCardPage(newPage(), pack);
  } else {
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
  const lastStep = model.steps[model.steps.length - 1];
  for (const step of model.steps) {
    const page = newPage();
    if (pack && step === lastStep) {
      drawPowerUpStep(page, pack, step);
      continue;
    }
    page.drawText(`Step ${step.index}`, { x: MARGIN, y: PAGE_H - 70, size: 22, font: bold });
    page.drawText(step.title, { x: MARGIN, y: PAGE_H - 90, size: 12, font });
    if (step.note) page.drawText(step.note, { x: MARGIN, y: PAGE_H - 106, size: 10, font, color: rgb(0.2, 0.2, 0.5) });

    // Parts needed for this step (callout box).
    const boxTop = PAGE_H - 120;
    const boxH = drawPartsCallout(page, model, step.index, boxTop, MARGIN, PAGE_W - 2 * MARGIN, bold);

    const r = renderIso(model.parts, { uptoStep: step.index, highlightStep: step.index, showFrontCue: true });
    drawRender(page, r, { x: MARGIN, y: 40, w: PAGE_W - 2 * MARGIN, h: boxTop - boxH - 60 }, bold);
  }

  return doc.save();
}
