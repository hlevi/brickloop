import { COLORS } from "../catalog/colors";
import { getPart } from "../catalog/parts";

/**
 * Simulator price table (cents). Deterministic stand-in for supplier pricing;
 * it is NOT market data and is labeled as an estimate wherever displayed.
 */
export function simulatedUnitCents(partId: string, colorId: string): number {
  const p = getPart(partId);
  const studs = p.w * p.d;
  let c: number;
  switch (p.category) {
    case "brick":
      c = 5 + studs * 2;
      break;
    case "plate":
      c = p.shape === "wheelHolder" ? 18 : 3 + Math.ceil(studs * 0.9);
      break;
    case "slope":
      c = 9 + studs * 2;
      break;
    case "round":
      c = 4;
      break;
    case "wheel":
      c = partId.startsWith("tire") ? 9 : 14;
      break;
  }
  if (COLORS[colorId]?.transparent) c += 4;
  return c;
}

export const SIM_PICKING_CENTS = 150;
export const SIM_PACKAGING_CENTS = 120;
export const SIM_TAX_RATE = 0.0725;

export function simulatedShippingCents(pieces: number): number {
  return 499 + Math.max(0, pieces - 40) * 3;
}
