import type { Bom } from "../bom/bom";
import { DEFAULT_SETTINGS, type OperatingSettings } from "../settings";
import { SIM_PACKAGING_CENTS, SIM_PICKING_CENTS, SIM_TAX_RATE, simulatedShippingCents, simulatedUnitCents } from "../suppliers/pricing-table";

export interface PriceEstimate {
  kind: "estimate";
  basis: string;
  partsCents: number;
  pickingCents: number;
  packagingCents: number;
  shippingCents: number;
  serviceFeeCents: number;
  taxCents: number;
  totalCents: number;
}

export function serviceFee(supplierTotalCents: number, s: Pick<OperatingSettings, "serviceFeeFlatCents" | "serviceFeePercent">): number {
  return s.serviceFeeFlatCents + Math.round((supplierTotalCents * s.serviceFeePercent) / 100);
}

/** Estimated payment processing cost, used to compute contribution (assumption: 2.9% + 30c). */
export function paymentFeeEstimate(totalCents: number): number {
  return Math.round(totalCents * 0.029) + 30;
}

/** Design-time estimate from the simulator price table. Never presented as a quote. */
export function estimatePrice(bom: Bom, settings: OperatingSettings = DEFAULT_SETTINGS): PriceEstimate {
  const partsCents = bom.lines.reduce((s, l) => s + simulatedUnitCents(l.partId, l.colorId) * l.quantity, 0);
  const shippingCents = simulatedShippingCents(bom.totalPieces);
  const taxCents = Math.round((partsCents + SIM_PICKING_CENTS + SIM_PACKAGING_CENTS + shippingCents) * SIM_TAX_RATE);
  const supplierTotal = partsCents + SIM_PICKING_CENTS + SIM_PACKAGING_CENTS + shippingCents + taxCents;
  const fee = serviceFee(supplierTotal, settings);
  return {
    kind: "estimate",
    basis: "Simulator price table. Not a supplier quote; a confirmed quote is obtained at checkout.",
    partsCents,
    pickingCents: SIM_PICKING_CENTS,
    packagingCents: SIM_PACKAGING_CENTS,
    shippingCents,
    serviceFeeCents: fee,
    taxCents,
    totalCents: supplierTotal + fee,
  };
}
