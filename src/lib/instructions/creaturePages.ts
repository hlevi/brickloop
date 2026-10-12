/**
 * Creature Pack pages: the keepsake cover, the cut-out Creature Card with its
 * Certificate of Invention, and a special final "Power up!" step.
 *
 * Kid-safe by construction: these pages only ever print the creature's name,
 * builder tag, power, stats, born date and serial. Nothing about the adult
 * purchaser is passed in, there are no prices, and the certificate leaves the
 * builder's real name as a blank line to write by hand.
 */
import { LineCapStyle, StandardFonts, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import { backdropFor } from "../creature/worlds";
import type { CreatureStats } from "../creature/stats";
import type { BuildStep, DesignModel } from "../model/types";
import type { ValidationResult } from "../validation/validate";
import { PLATE_H, project, renderIso } from "./iso";
import {
  drawPartsCallout,
  drawRender,
  fitRender,
  fitSize,
  gem,
  gradientRect,
  hexColor,
  mixHex,
  pips,
  roundedRect,
  sparkle,
  star,
  text,
  wrapLines,
  type Box,
} from "./pdfDraw";

export interface CreaturePackInfo {
  /** e.g. "Captain Fizzfang". */
  name: string;
  /** Builder tag, e.g. "BraveOtter42" (never a real name). */
  builder: string;
  /** "BL-7K2Q9" on orders; null on design previews, which print "PREVIEW". */
  serial: string | null;
  bornOn: Date | string;
  power: { label: string; colorHex: string };
  stats: CreatureStats;
}

export interface PackFonts {
  regular: PDFFont;
  bold: PDFFont;
  serifBold: PDFFont;
  serifItalic: PDFFont;
  italic: PDFFont;
}

export async function embedPackFonts(doc: PDFDocument, regular: PDFFont, bold: PDFFont): Promise<PackFonts> {
  return {
    regular,
    bold,
    serifBold: await doc.embedFont(StandardFonts.TimesRomanBold),
    serifItalic: await doc.embedFont(StandardFonts.TimesRomanItalic),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
}

export interface PackContext {
  model: DesignModel;
  info: CreaturePackInfo;
  fonts: PackFonts;
  validation: ValidationResult;
  pieces: number;
  pageW: number;
  pageH: number;
  margin: number;
}

const INK = "#1d1d1f";
const SOFT_INK = "#4a4d55";
const MUTED = "#767a83";
const CREAM_TOP = "#fffaf0";
const CREAM_BOTTOM = "#ffe9c7";
const TITLE_RED = "#b3261e";
const PIP_ON = "#f2cd37";
const NIGHT_TOP = "#1a2147";
const NIGHT_BOTTOM = "#33468a";

const MM = 72 / 25.4;
/** The printed card is a standard trading card: 63 x 88 mm. */
export const CARD_W = 63 * MM;
export const CARD_H = 88 * MM;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Oct 2026" (UTC, so the date never depends on the server's time zone). */
export function formatBornOn(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function serialLine(info: CreaturePackInfo): string {
  const born = formatBornOn(info.bornOn);
  const id = info.serial ? `No. ${info.serial}` : "PREVIEW";
  return born ? `${id}  ·  Born ${born}` : id;
}

const STAT_ROWS: { key: keyof Omit<CreatureStats, "title" | "pieces">; label: string; why: string }[] = [
  { key: "size", label: "Size", why: "Taller creatures are bigger." },
  { key: "zoom", label: "Zoom", why: "Wheels zoom fastest. Jetpacks and short legs help." },
  { key: "fly", label: "Fly", why: "Wings fly best. A jetpack helps too." },
  { key: "armor", label: "Armor", why: "Spikes and shells make it tough." },
  { key: "chomp", label: "Chomp", why: "The further the head sticks out, the bigger the chomp." },
];

/** A strong, readable accent from the creature's world backdrop. */
function accentOf(model: DesignModel): string {
  const [, deep] = backdropFor(model.params.colors);
  return mixHex(deep, "#000000", 0.18);
}

/** Small deterministic scatter of sparkles (no randomness, so PDFs are reproducible). */
function scatter(box: Box, n: number, seed: number): { x: number; y: number; s: number }[] {
  let s = seed >>> 0 || 7;
  const next = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  return Array.from({ length: n }, () => ({ x: box.x + next() * box.w, y: box.y + next() * box.h, s: 0.5 + next() }));
}

function nameSeed(name: string): number {
  let h = 2166136261;
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Cover
// ---------------------------------------------------------------------------

export function drawCreatureCover(page: PDFPage, c: PackContext) {
  const { info, fonts, model, pageW, margin } = c;
  const cx = pageW / 2;
  const [bgTop, bgBottom] = backdropFor(model.params.colors);

  text(page, "BRICKLOOP CREATURE PACK", cx, 728, { font: fonts.bold, size: 9, spacing: 2.4, color: MUTED }, "middle");
  const nameSize = fitSize(fonts.bold, info.name, pageW - 2 * margin, 34, 20);
  text(page, info.name, cx, 690, { font: fonts.bold, size: nameSize, color: INK }, "middle");
  text(page, `Invented by ${info.builder}`, cx, 664, { font: fonts.regular, size: 15, color: SOFT_INK }, "middle");

  // The stage: the creature on its world backdrop.
  const panel: Box = { x: margin, y: 214, w: pageW - 2 * margin, h: 424 };
  gradientRect(page, panel, 22, bgTop, bgBottom);
  page.drawEllipse({ x: cx, y: panel.y + panel.h * 0.56, xScale: panel.w * 0.4, yScale: panel.h * 0.36, color: hexColor("#ffffff"), opacity: 0.32 });
  for (const p of scatter({ x: panel.x + 24, y: panel.y + 30, w: panel.w - 48, h: panel.h - 54 }, 14, nameSeed(info.name))) {
    // Keep sparkles near the edges of the stage, away from the creature.
    const dx = Math.abs(p.x - cx) / (panel.w / 2);
    const dy = Math.abs(p.y - (panel.y + panel.h / 2)) / (panel.h / 2);
    if (dx < 0.62 && dy < 0.62) continue;
    sparkle(page, p.x, p.y, 4 + p.s * 5, "#ffffff", 0.85);
  }
  const r = renderIso(model.parts);
  const artBox: Box = { x: panel.x + 40, y: panel.y + 52, w: panel.w - 80, h: panel.h - 84 };
  const fit = fitRender(r, artBox);
  const footY = fit.ty(r.maxY);
  page.drawEllipse({ x: (fit.tx(r.minX) + fit.tx(r.maxX)) / 2, y: footY + 6, xScale: (fit.tx(r.maxX) - fit.tx(r.minX)) * 0.42, yScale: 11, color: hexColor(INK), opacity: 0.12 });
  drawRender(page, r, artBox, fonts.bold);
  roundedRect(page, panel, 22, { stroke: INK, strokeWidth: 2.5 });

  // Serial pill straddling the bottom edge of the stage.
  const serial = serialLine(info);
  const pillStyle = { font: fonts.bold, size: 12.5, color: INK };
  const pillW = fonts.bold.widthOfTextAtSize(serial, pillStyle.size) + 44;
  roundedRect(page, { x: cx - pillW / 2, y: panel.y - 15, w: pillW, h: 30 }, 15, { fill: "#ffffff", stroke: INK, strokeWidth: 2 });
  text(page, serial, cx, panel.y - 4.5, pillStyle, "middle");

  // Power and title row.
  const rowY = 158;
  const parts: { t: string; bold: boolean }[] = [
    { t: `${info.power.label} power`, bold: true },
    { t: "  ·  ", bold: false },
    { t: info.stats.title, bold: true },
    { t: "  ·  ", bold: false },
    { t: `${c.pieces} bricks, ${model.steps.length} steps`, bold: false },
  ];
  const size = 13;
  const gemW = 22;
  const total = gemW + 8 + parts.reduce((w, p) => w + (p.bold ? fonts.bold : fonts.regular).widthOfTextAtSize(p.t, size), 0);
  let x = cx - total / 2;
  gem(page, x + gemW / 2, rowY + 4.5, gemW, info.power.colorHex, INK);
  x += gemW + 8;
  for (const p of parts) x += text(page, p.t, x, rowY, { font: p.bold ? fonts.bold : fonts.regular, size, color: p.bold ? INK : SOFT_INK });

  // Honest fine print.
  const v = c.validation;
  const fine = [
    `${v.status === "valid" ? "Digital build check: every brick connects." : `Digital validation: ${v.status.toUpperCase()}.`}  Physical test build: ${
      v.physicallyValidated ? "done for this design." : "not yet done for this design."
    }`,
    "Contains small parts. Not for children under 3 years.",
    `Original BrickLoop design (${model.templateVersion}). Built from genuine bricks sourced per order.`,
  ];
  page.drawLine({ start: { x: cx - 120, y: 122 }, end: { x: cx + 120, y: 122 }, thickness: 0.6, color: hexColor("#d7d9de") });
  fine.forEach((t, i) => text(page, t, cx, 104 - i * 14, { font: i === 1 ? fonts.bold : fonts.regular, size: 8.5, color: i === 1 ? INK : SOFT_INK }, "middle"));
}

// ---------------------------------------------------------------------------
// Card + certificate page
// ---------------------------------------------------------------------------

/** Small scissors on the cut line, pointing along it (drawn: standard fonts have no emoji). */
function drawScissors(page: PDFPage, x: number, y: number) {
  const ink = hexColor(SOFT_INK);
  page.drawRectangle({ x: x - 3, y: y - 6, width: 23, height: 12, color: hexColor("#ffffff") });
  page.drawLine({ start: { x: x + 5.2, y: y + 2.2 }, end: { x: x + 18, y: y - 1.6 }, thickness: 1.5, color: ink, lineCap: LineCapStyle.Round });
  page.drawLine({ start: { x: x + 5.2, y: y - 2.2 }, end: { x: x + 18, y: y + 1.6 }, thickness: 1.5, color: ink, lineCap: LineCapStyle.Round });
  page.drawCircle({ x: x + 2.6, y: y + 3.1, size: 2.4, borderColor: ink, borderWidth: 1.1, color: hexColor("#ffffff") });
  page.drawCircle({ x: x + 2.6, y: y - 3.1, size: 2.4, borderColor: ink, borderWidth: 1.1, color: hexColor("#ffffff") });
  page.drawCircle({ x: x + 10.6, y, size: 0.8, color: hexColor("#ffffff") });
}

/** The cut-out trading card (x, y = bottom-left of the 63 x 88 mm cut line). */
export function drawCreatureCard(page: PDFPage, c: PackContext, x: number, y: number) {
  const { info, fonts, model } = c;
  const [bgTop, bgBottom] = backdropFor(model.params.colors);
  page.drawRectangle({ x, y, width: CARD_W, height: CARD_H, borderColor: hexColor("#8b8f97"), borderWidth: 0.9, borderDashArray: [5, 3] });
  drawScissors(page, x + 12, y + CARD_H);

  const body: Box = { x: x + 4.5, y: y + 4.5, w: CARD_W - 9, h: CARD_H - 9 };
  gradientRect(page, body, 10, CREAM_TOP, CREAM_BOTTOM);
  roundedRect(page, body, 10, { stroke: INK, strokeWidth: 2.4 });

  const pad = 9;
  const ix = body.x + pad;
  const iw = body.w - 2 * pad;
  let top = body.y + body.h - pad;

  // Name and power gem.
  const nameSize = fitSize(fonts.bold, info.name, iw - 24, 13.5, 7.5);
  text(page, info.name, ix, top - 12, { font: fonts.bold, size: nameSize, color: INK });
  gem(page, ix + iw - 8, top - 7.5, 15, info.power.colorHex, INK);
  top -= 20;

  // Art window.
  const art: Box = { x: ix, y: top - 94, w: iw, h: 94 };
  gradientRect(page, art, 7, bgTop, bgBottom, 32);
  page.drawEllipse({ x: art.x + art.w / 2, y: art.y + art.h * 0.52, xScale: art.w * 0.36, yScale: art.h * 0.36, color: hexColor("#ffffff"), opacity: 0.3 });
  drawRender(page, renderIso(model.parts), { x: art.x + 5, y: art.y + 4, w: art.w - 10, h: art.h - 8 }, fonts.bold);
  roundedRect(page, art, 7, { stroke: INK, strokeWidth: 1.6 });
  top -= 94;

  // Super title.
  text(page, info.stats.title.toUpperCase(), ix + iw / 2, top - 13.5, { font: fonts.bold, size: 9.5, spacing: 0.8, color: TITLE_RED }, "middle");
  top -= 20;

  // Five stats with pips.
  const pipR = 4;
  const pipGap = 2.6;
  const pipsW = 10 * pipR + 4 * pipGap;
  STAT_ROWS.forEach((s, i) => {
    const cy = top - 6.5 - i * 13.4;
    text(page, s.label, ix + 2, cy - 2.9, { font: fonts.bold, size: 8.2, color: INK });
    pips(page, ix + iw - pipsW - 1, cy, info.stats[s.key], { r: pipR, gap: pipGap, on: PIP_ON, off: "#ffffff", ink: INK, strokeWidth: 1.1 });
  });

  // Credit and serial.
  const footTop = body.y + pad + 16;
  page.drawLine({ start: { x: ix + 18, y: footTop + 6 }, end: { x: ix + iw - 18, y: footTop + 6 }, thickness: 0.5, color: hexColor("#d9c7a3") });
  const credit = `Invented by ${info.builder}`;
  text(page, credit, ix + iw / 2, footTop - 5, { font: fonts.bold, size: fitSize(fonts.bold, credit, iw, 7.6, 6), color: INK }, "middle");
  text(page, serialLine(info), ix + iw / 2, footTop - 14, { font: fonts.regular, size: 6.2, color: SOFT_INK }, "middle");
}

function drawStatGuide(page: PDFPage, c: PackContext, x: number, top: number, w: number) {
  const { fonts, info } = c;
  text(page, "Where the stats come from", x, top - 13, { font: fonts.bold, size: 13, color: INK });
  text(page, "Every stat is counted from the real bricks in your box.", x, top - 29, { font: fonts.regular, size: 9.5, color: SOFT_INK });
  let y = top - 56;
  for (const s of STAT_ROWS) {
    text(page, s.label, x, y, { font: fonts.bold, size: 11, color: INK });
    pips(page, x + 54, y + 3.6, info.stats[s.key], { r: 3.6, gap: 2.4, on: PIP_ON, off: "#ffffff", ink: INK, strokeWidth: 0.9 });
    const lines = wrapLines(fonts.regular, s.why, 9.5, w - 4);
    lines.forEach((l, i) => text(page, l, x, y - 14 - i * 11.5, { font: fonts.regular, size: 9.5, color: SOFT_INK }));
    y -= 30 + (lines.length - 1) * 11.5;
  }
  const tw = text(page, "Its best stat gives it a title: ", x, y - 4, { font: fonts.regular, size: 9.5, color: SOFT_INK });
  text(page, `${info.stats.title}!`, x + tw, y - 4, { font: fonts.bold, size: 9.5, color: TITLE_RED });
}

/** Rosette seal in the power color. */
function drawSeal(page: PDFPage, c: PackContext, cx: number, cy: number) {
  const accent = accentOf(c.model);
  const tail = (dir: number) =>
    page.drawSvgPath(
      `M${cx + dir * 6},${-(cy - 8)} L${cx + dir * 22},${-(cy - 48)} L${cx + dir * 13},${-(cy - 42)} L${cx + dir * 7},${-(cy - 52)} L${cx - dir * 6},${-(cy - 14)} Z`,
      { x: 0, y: 0, color: hexColor(accent), borderColor: hexColor(INK), borderWidth: 0.9 },
    );
  tail(-1);
  tail(1);
  star(page, cx, cy, 31, 26.5, { fill: mixHex(c.info.power.colorHex, "#ffffff", 0.15), stroke: INK, strokeWidth: 1 }, 18);
  page.drawCircle({ x: cx, y: cy, size: 21, color: hexColor("#ffffff"), borderColor: hexColor(INK), borderWidth: 1 });
  page.drawCircle({ x: cx, y: cy, size: 17.5, borderColor: hexColor(accent), borderWidth: 0.7, borderDashArray: [1.5, 1.8] });
  star(page, cx, cy - 0.5, 11, 4.6, { fill: PIP_ON, stroke: INK, strokeWidth: 0.9 });
}

export function drawCertificate(page: PDFPage, c: PackContext, box: Box) {
  const { info, fonts } = c;
  const cx = box.x + box.w / 2;
  const accent = accentOf(c.model);
  const topY = box.y + box.h;
  roundedRect(page, box, 14, { fill: "#fffdf7", stroke: INK, strokeWidth: 2.4 });
  roundedRect(page, { x: box.x + 9, y: box.y + 9, w: box.w - 18, h: box.h - 18 }, 9, { stroke: accent, strokeWidth: 1.3 });
  roundedRect(page, { x: box.x + 13, y: box.y + 13, w: box.w - 26, h: box.h - 26 }, 6, { stroke: accent, strokeWidth: 0.5 });
  for (const [sx, sy] of [
    [box.x + 30, topY - 30],
    [box.x + box.w - 30, topY - 30],
    [box.x + 30, box.y + 30],
    [box.x + box.w - 30, box.y + 30],
  ])
    star(page, sx, sy, 8, 3.4, { fill: PIP_ON, stroke: INK, strokeWidth: 0.8 });

  text(page, "BRICKLOOP CREATURE LAB", cx, topY - 38, { font: fonts.bold, size: 8.5, spacing: 2.2, color: MUTED }, "middle");
  text(page, "Certificate of Invention", cx, topY - 70, { font: fonts.serifBold, size: 31, color: INK }, "middle");
  page.drawLine({ start: { x: cx - 110, y: topY - 86 }, end: { x: cx - 16, y: topY - 86 }, thickness: 0.8, color: hexColor(accent) });
  page.drawLine({ start: { x: cx + 16, y: topY - 86 }, end: { x: cx + 110, y: topY - 86 }, thickness: 0.8, color: hexColor(accent) });
  gem(page, cx, topY - 85.5, 14, info.power.colorHex, INK);

  text(page, "This certifies that", cx, topY - 112, { font: fonts.serifItalic, size: 14, color: SOFT_INK }, "middle");
  // A blank line: the builder writes their own name by hand. We never collect it.
  const lineY = topY - 150;
  const labelW = text(page, "Builder:", cx - 175, lineY + 2, { font: fonts.bold, size: 12.5, color: INK });
  page.drawLine({ start: { x: cx - 175 + labelW + 8, y: lineY }, end: { x: cx + 175, y: lineY }, thickness: 1, color: hexColor(INK) });
  text(page, "write your name here", cx + 30, lineY - 11, { font: fonts.italic, size: 7.5, color: MUTED }, "middle");

  text(page, "invented a brand-new creature called", cx, lineY - 36, { font: fonts.serifItalic, size: 14, color: SOFT_INK }, "middle");
  const nameSize = fitSize(fonts.bold, info.name, box.w - 120, 28, 16);
  text(page, info.name, cx, lineY - 70, { font: fonts.bold, size: nameSize, color: INK }, "middle");
  text(page, `${info.stats.title}  ·  ${info.power.label} power  ·  Invented by ${info.builder}`, cx, lineY - 90, { font: fonts.regular, size: 10.5, color: SOFT_INK }, "middle");

  // Born date, seal, serial.
  const rowY = box.y + 62;
  const colL = box.x + 120;
  const colR = box.x + box.w - 120;
  const born = formatBornOn(info.bornOn);
  text(page, "BORN", colL, rowY + 12, { font: fonts.bold, size: 7.5, spacing: 1.6, color: MUTED }, "middle");
  text(page, born || "-", colL, rowY - 5, { font: fonts.bold, size: 13, color: INK }, "middle");
  page.drawLine({ start: { x: colL - 55, y: rowY - 13 }, end: { x: colL + 55, y: rowY - 13 }, thickness: 0.6, color: hexColor(accent) });
  text(page, info.serial ? "SERIAL NO." : "NOT ORDERED YET", colR, rowY + 12, { font: fonts.bold, size: 7.5, spacing: 1.6, color: MUTED }, "middle");
  text(page, info.serial ?? "PREVIEW", colR, rowY - 5, { font: fonts.bold, size: 13, color: INK }, "middle");
  page.drawLine({ start: { x: colR - 55, y: rowY - 13 }, end: { x: colR + 55, y: rowY - 13 }, thickness: 0.6, color: hexColor(accent) });
  drawSeal(page, c, cx, rowY + 4);
}

export function drawCardPage(page: PDFPage, c: PackContext) {
  const { fonts, margin, pageW } = c;
  text(page, "Your Creature Card", margin, 724, { font: fonts.bold, size: 22, color: INK });
  text(page, "Cut along the dashed line. A grown-up can help with the scissors.", margin, 706, { font: fonts.regular, size: 10, color: SOFT_INK });
  const cardX = margin + 8;
  const cardTop = 684;
  drawCreatureCard(page, c, cardX, cardTop - CARD_H);
  const guideX = cardX + CARD_W + 36;
  drawStatGuide(page, c, guideX, cardTop, pageW - margin - guideX);
  text(page, "Print at actual size (100%) for a standard 63 x 88 mm trading card.", cardX, cardTop - CARD_H - 13, { font: fonts.regular, size: 7.5, color: MUTED });
  drawCertificate(page, c, { x: margin, y: 44, w: pageW - 2 * margin, h: 362 });
}

// ---------------------------------------------------------------------------
// Final step: "Power up!"
// ---------------------------------------------------------------------------

export function drawPowerUpStep(page: PDFPage, c: PackContext, step: BuildStep) {
  const { fonts, model, info, pageW, margin } = c;
  const power = info.power.colorHex;
  const glow = mixHex(power, "#ffffff", 0.35);

  // Night-sky banner with the glowing core.
  const banner: Box = { x: margin, y: 642, w: pageW - 2 * margin, h: 98 };
  gradientRect(page, banner, 18, NIGHT_TOP, NIGHT_BOTTOM);
  const gx = banner.x + banner.w - 64;
  const gy = banner.y + banner.h / 2;
  for (const p of scatter({ x: banner.x + 12, y: banner.y + 10, w: banner.w - 24, h: banner.h - 20 }, 30, nameSeed(info.name) ^ 0x5eed)) {
    if (p.x < banner.x + 270) continue; // keep the title clear
    if (Math.hypot(p.x - gx, p.y - gy) < 50) continue; // and the glowing core
    sparkle(page, p.x, p.y, 2 + p.s * 3.2, p.s > 1.1 ? glow : "#ffffff", 0.9);
  }
  for (const [rr, op] of [
    [44, 0.12],
    [34, 0.18],
    [25, 0.26],
  ] as const)
    page.drawCircle({ x: gx, y: gy, size: rr, color: hexColor(glow), opacity: op });
  gem(page, gx, gy + 1, 46, power, "#0f1430");
  text(page, `STEP ${step.index}`, banner.x + 26, banner.y + 66, { font: fonts.bold, size: 10, spacing: 2, color: glow });
  text(page, step.title, banner.x + 24, banner.y + 24, { font: fonts.bold, size: 36, color: "#ffffff" });

  // The wish, big.
  const wish = step.note ?? `Make a wish, then click ${info.name}'s power core into place.`;
  const wishSize = 17;
  const lines = wrapLines(fonts.bold, wish, wishSize, pageW - 2 * margin);
  lines.forEach((l, i) => text(page, l, margin, 612 - i * 22, { font: fonts.bold, size: wishSize, color: INK }));

  const boxTop = 612 - (lines.length - 1) * 22 - 18;
  const boxH = drawPartsCallout(page, model, step.index, boxTop, margin, pageW - 2 * margin, fonts.bold);

  // The finished creature, with a glow where the core clicks in.
  const r = renderIso(model.parts, { uptoStep: step.index, highlightStep: step.index, showFrontCue: true });
  const area: Box = { x: margin, y: 84, w: pageW - 2 * margin, h: boxTop - boxH - 104 };
  const fit = drawRender(page, r, area, fonts.bold);
  const core = model.parts.find((p) => p.component === "core" && p.step === step.index);
  if (core) {
    const [px, py] = project(core.x + 0.5, (core.y + 3) * PLATE_H, core.z + 0.5);
    const x = fit.tx(px);
    const y = fit.ty(py);
    const unit = fit.scale;
    for (const [k, op] of [
      [2.2, 0.14],
      [1.6, 0.18],
      [1.1, 0.24],
    ] as const)
      page.drawCircle({ x, y, size: k * unit, color: hexColor(glow), opacity: op });
    page.drawCircle({ x, y, size: 1.25 * unit, borderColor: hexColor(INK), borderWidth: 1.4, borderDashArray: [4, 3] });
    // Label with a leader line, up and to the left of the core.
    const label = "Power core goes here!";
    const lw = fonts.bold.widthOfTextAtSize(label, 11) + 16;
    const lx = Math.max(area.x, x - 1.25 * unit - 40 - lw);
    const ly = Math.min(area.y + area.h - 22, y + 1.25 * unit + 26);
    page.drawLine({ start: { x: lx + lw, y: ly + 11 }, end: { x: x - 0.9 * unit, y: y + 0.9 * unit }, thickness: 1.2, color: hexColor(INK) });
    roundedRect(page, { x: lx, y: ly, w: lw, h: 22 }, 11, { fill: "#ffffff", stroke: INK, strokeWidth: 1.4 });
    text(page, label, lx + lw / 2, ly + 7.2, { font: fonts.bold, size: 11, color: INK }, "middle");
  }

  // Ta-da.
  const tada = `Ta-da! ${info.name} is ready for adventures.`;
  const tw = text(page, tada, pageW / 2, 50, { font: fonts.bold, size: 14, color: INK }, "middle");
  star(page, pageW / 2 - tw / 2 - 16, 55, 8, 3.4, { fill: PIP_ON, stroke: INK, strokeWidth: 0.8 });
  star(page, pageW / 2 + tw / 2 + 16, 55, 8, 3.4, { fill: PIP_ON, stroke: INK, strokeWidth: 0.8 });
}
