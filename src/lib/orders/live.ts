import { getDb } from "../db";
import { env } from "../config";
import { allSuppliers } from "../suppliers/registry";
import { PHYSICAL_VALIDATIONS } from "../validation/physical";

export interface ReadinessItem {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

/**
 * Live purchasing stays disabled until every item is satisfied. Orders created
 * while not ready run in simulation mode and are labeled as such everywhere.
 */
export async function liveReadiness(): Promise<{ ready: boolean; items: ReadinessItem[] }> {
  const supplier = allSuppliers().find((s) => s.id === env.supplier);
  const db = await getDb();
  const limits = await db.query<{ key: string }>(`SELECT key FROM settings WHERE key = 'operating'`);
  const verified = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM part_mappings WHERE status = 'verified'`);
  const items: ReadinessItem[] = [
    { id: "flag", label: "LIVE_PURCHASING_ENABLED=true", ok: env.livePurchasingRequested, detail: "Explicit owner authorization via environment." },
    {
      id: "supplier",
      label: "Supplier with verified purchase capabilities",
      ok: !!supplier && supplier.mode === "live" && supplier.capabilityStatus === "verified" && supplier.capabilities.quote && supplier.capabilities.purchase && supplier.capabilities.lookupOrder,
      detail: supplier ? `${supplier.name}: ${supplier.capabilityStatus}` : `Unknown supplier ${env.supplier}`,
    },
    { id: "allowlist", label: "Supplier on allowlist", ok: env.supplierAllowlist.includes(env.supplier), detail: `Allowlist: ${env.supplierAllowlist.join(", ")}` },
    { id: "payments", label: "Live payment provider configured", ok: env.paymentProvider !== "simulated", detail: `Provider: ${env.paymentProvider} (only the sandbox is implemented)` },
    { id: "limits", label: "Spending limits explicitly configured by the owner", ok: limits.rows.length > 0, detail: "Save operating settings at least once in the admin panel." },
    { id: "mappings", label: "Verified part/color mappings", ok: Number(verified.rows[0]?.n ?? 0) > 0, detail: `${verified.rows[0]?.n ?? 0} verified mapping rows; every order line must also be verified.` },
    { id: "physical", label: "Physically validated configurations", ok: PHYSICAL_VALIDATIONS.length > 0, detail: `${PHYSICAL_VALIDATIONS.length} recorded test builds.` },
    { id: "e2e", label: "End-to-end check against the live supplier", ok: process.env.LIVE_E2E_VERIFIED_AT !== undefined, detail: "Set LIVE_E2E_VERIFIED_AT after a controlled real order succeeds." },
  ];
  return { ready: items.every((i) => i.ok), items };
}
