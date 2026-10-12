import { getPart } from "../catalog/parts";
import type { DesignModel } from "../model/types";

export interface StepPartLine {
  partId: string;
  colorId: string;
  quantity: number;
}

/** Pieces required for one step, including accessories (e.g. tires on wheels). */
export function stepParts(model: DesignModel, step: number): StepPartLine[] {
  const m = new Map<string, number>();
  for (const p of model.parts) {
    if (p.step !== step) continue;
    const add = (partId: string, colorId: string, n: number) => m.set(`${partId}|${colorId}`, (m.get(`${partId}|${colorId}`) ?? 0) + n);
    add(p.partId, p.colorId, 1);
    for (const a of getPart(p.partId).accessories ?? []) add(a.partId, a.colorId, a.qty);
  }
  return [...m.entries()]
    .map(([k, quantity]) => {
      const [partId, colorId] = k.split("|");
      return { partId, colorId, quantity };
    })
    .sort((a, b) => a.partId.localeCompare(b.partId));
}

export interface StepSummary {
  index: number;
  title: string;
  note?: string;
  parts: StepPartLine[];
  pieceCount: number;
}

export function summarizeSteps(model: DesignModel): StepSummary[] {
  return model.steps.map((s) => {
    const parts = stepParts(model, s.index);
    return { ...s, parts, pieceCount: parts.reduce((n, p) => n + p.quantity, 0) };
  });
}
