import { env } from "../config";
import { SimulatorSupplier, SIMULATOR_INFO } from "./simulator";
import { CANDIDATE_SUPPLIERS, UnverifiedSupplier } from "./unverified";
import { UnsupportedOperationError, type CapabilityOp, type SupplierAdapter, type SupplierInfo } from "./types";
import { AppError } from "../util";

export function allSuppliers(): SupplierInfo[] {
  return [SIMULATOR_INFO, ...CANDIDATE_SUPPLIERS];
}

let simulator: SimulatorSupplier | null = null;

/** Resolve an adapter, enforcing the supplier allowlist. */
export function getSupplier(id: string = env.supplier): SupplierAdapter {
  if (!env.supplierAllowlist.includes(id)) throw new AppError("supplier_not_allowed", `Supplier "${id}" is not on the allowlist`, 403);
  if (id === "simulator") return (simulator ??= new SimulatorSupplier());
  const info = CANDIDATE_SUPPLIERS.find((s) => s.id === id);
  if (!info) throw new AppError("unknown_supplier", `Unknown supplier "${id}"`, 400);
  return new UnverifiedSupplier(info);
}

export function requireCapability(s: SupplierAdapter, op: CapabilityOp) {
  if (!s.info.capabilities[op]) throw new UnsupportedOperationError(s.info.id, op, "capability not available");
}
