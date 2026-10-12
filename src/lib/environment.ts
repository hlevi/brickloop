import { PARTS } from "./catalog/parts";
import type { Bom } from "./bom/bom";

export interface EnvironmentalReport {
  label: "new" | "reused" | "mixed";
  reusedWeightGrams: number | null;
  weightCoverage: { linesWithWeight: number; totalLines: number };
  statement: string;
  carbonComparison: { enabled: false; reason: string };
}

export const CARBON_DISABLED_REASON =
  "Carbon comparisons are disabled. They need an evidence-based methodology covering manufacturing, collection, cleaning, packaging and shipping, with stated assumptions and uncertainty.";

/** Measured reuse only. Avoided waste is never inferred from reused weight. */
export function environmentalReport(bom: Bom, label: "new" | "reused" | "mixed"): EnvironmentalReport {
  const withWeight = bom.lines.filter((l) => PARTS[l.partId]?.weightGrams != null);
  const reusedLines = label === "new" ? [] : bom.lines;
  const allReusedWeighted = reusedLines.every((l) => PARTS[l.partId]?.weightGrams != null);
  const reusedWeight =
    label === "new" ? 0 : allReusedWeighted ? reusedLines.reduce((s, l) => s + (PARTS[l.partId].weightGrams ?? 0) * l.quantity, 0) : null;
  return {
    label,
    reusedWeightGrams: reusedWeight,
    weightCoverage: { linesWithWeight: withWeight.length, totalLines: bom.lines.length },
    statement:
      label === "new"
        ? "All parts in this pilot order are new genuine parts. No reuse is claimed."
        : reusedWeight === null
          ? "Some parts are reused, but reliable part weights are not available for every line, so no reused weight is reported."
          : `Reused parts weigh ${reusedWeight} g (measured from part-weight data).`,
    carbonComparison: { enabled: false, reason: CARBON_DISABLED_REASON },
  };
}
