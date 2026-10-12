import { COLORS } from "../catalog/colors";
import { getPart } from "../catalog/parts";

/**
 * Simulator price table (cents per part, new condition). The values sit in the
 * typical range seen for common new parts on secondary marketplaces
 * (roughly 3-15 cents for small bricks and plates). They are NOT live market
 * data and are labeled as estimates wherever displayed.
 */
const BASE_CENTS: Record<string, number> = {
  "brick-1x1": 4, "brick-1x2": 5, "brick-1x3": 6, "brick-1x4": 7, "brick-1x6": 10, "brick-1x8": 13, "brick-1x2-nt": 6,
  "brick-2x2": 6, "brick-2x3": 8, "brick-2x4": 9, "brick-2x6": 14,
  "plate-1x1": 3, "plate-1x2": 3, "plate-1x3": 4, "plate-1x4": 4, "plate-1x6": 6, "plate-1x8": 7,
  "plate-2x2": 4, "plate-2x3": 5, "plate-2x4": 6, "plate-2x6": 8, "plate-2x8": 10, "plate-2x10": 12, "plate-2x12": 14,
  "plate-4x4": 12, "plate-4x6": 14, "plate-4x8": 18, "plate-4x10": 22, "plate-4x12": 26, "plate-6x6": 22, "plate-6x8": 28, "plate-6x10": 34, "plate-6x12": 40, "plate-8x8": 38,
  "tile-1x1": 4, "tile-1x2": 4, "tile-1x4": 7, "tile-1x6": 10, "tile-2x2": 6,
  "plate-round-1x1": 3, "brick-round-1x1": 5, "brick-round-2x2": 9, "plate-round-2x2": 5,
  "slope-45-2x1": 6, "slope-45-2x2": 8, "slope-45-2x4": 13, "ridge-45-2x2": 10, "ridge-45-2x4": 16,
  "plate-2x2-wheel-holder": 9, "wheel-8x6": 6, "tire-14x4": 5,
};

export function simulatedUnitCents(partId: string, colorId: string): number {
  const p = getPart(partId);
  let c = BASE_CENTS[partId] ?? 5 + p.w * p.d;
  if (COLORS[colorId]?.transparent) c += 3;
  return c;
}

/** Single-supplier pick-and-pack fee per order (simulated). */
export const SIM_PICKING_CENTS = 100;
export const SIM_PACKAGING_CENTS = 75;
export const SIM_TAX_RATE = 0.0725;

/** Small-parcel shipping: flat base plus a little per 100 pieces (simulated). */
export function simulatedShippingCents(pieces: number): number {
  return 450 + Math.floor(pieces / 100) * 75;
}
