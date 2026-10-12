import { COLORS } from "../catalog/colors";
import { getPart } from "../catalog/parts";
import { defaultLookup, type ExternalMapping, type MappingLookup } from "../catalog/mappings";
import type { DesignModel } from "../model/types";

export interface BomLine {
  partId: string;
  partName: string;
  colorId: string;
  colorName: string;
  quantity: number;
  mapping: ExternalMapping;
}

export interface Bom {
  lines: BomLine[];
  totalPieces: number;
  unresolved: BomLine[];
  /** True only when every line has a verified external mapping. */
  liveSourcingReady: boolean;
}

/** Quantities are derived from the authoritative model, including accessories (e.g. tires on wheels). */
export function computeBom(model: DesignModel, lookup: MappingLookup = defaultLookup): Bom {
  const counts = new Map<string, number>();
  const bump = (partId: string, colorId: string, n: number) => {
    const k = `${partId}|${colorId}`;
    counts.set(k, (counts.get(k) ?? 0) + n);
  };
  for (const p of model.parts) {
    bump(p.partId, p.colorId, 1);
    for (const acc of getPart(p.partId).accessories ?? []) bump(acc.partId, acc.colorId, acc.qty);
  }
  const lines: BomLine[] = [...counts.entries()]
    .map(([k, quantity]) => {
      const [partId, colorId] = k.split("|");
      return {
        partId,
        partName: getPart(partId).name,
        colorId,
        colorName: COLORS[colorId]?.name ?? colorId,
        quantity,
        mapping: lookup(partId, colorId),
      };
    })
    .sort((a, b) => a.partId.localeCompare(b.partId) || a.colorId.localeCompare(b.colorId));
  const unresolved = lines.filter((l) => l.mapping.status !== "verified");
  return {
    lines,
    totalPieces: lines.reduce((s, l) => s + l.quantity, 0),
    unresolved,
    liveSourcingReady: unresolved.length === 0,
  };
}
