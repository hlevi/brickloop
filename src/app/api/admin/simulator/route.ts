import { NextResponse } from "next/server";
import { getSimulatorSettings, updateSimulatorSettings, type SimulatorSettings } from "@/lib/settings";
import { assertSameOrigin, readJson, requireAdmin, route } from "@/lib/http";
import { AppError } from "@/lib/util";

const FAULTS = [null, "timeout_placed", "timeout_not_placed", "partial", "error"];

export const GET = route(async () => {
  await requireAdmin();
  return NextResponse.json(await getSimulatorSettings());
});

export const PUT = route(async (req: Request) => {
  assertSameOrigin(req);
  const actor = await requireAdmin();
  const b = await readJson(req);
  const patch: Partial<SimulatorSettings> = {};
  if ("nextPurchaseFault" in b) {
    if (!FAULTS.includes(b.nextPurchaseFault as string | null)) throw new AppError("invalid", "Unknown fault");
    patch.nextPurchaseFault = b.nextPurchaseFault as SimulatorSettings["nextPurchaseFault"];
  }
  if ("priceDriftPercent" in b) {
    const n = Number(b.priceDriftPercent);
    if (!Number.isFinite(n) || n < -50 || n > 200) throw new AppError("invalid", "priceDriftPercent must be between -50 and 200");
    patch.priceDriftPercent = n;
  }
  if ("outOfStock" in b) {
    if (!Array.isArray(b.outOfStock)) throw new AppError("invalid", "outOfStock must be an array");
    patch.outOfStock = b.outOfStock.map(String).slice(0, 50);
  }
  if ("nextAuthorizationDeclined" in b) patch.nextAuthorizationDeclined = b.nextAuthorizationDeclined === true;
  if ("nextCaptureFails" in b) patch.nextCaptureFails = b.nextCaptureFails === true;
  return NextResponse.json(await updateSimulatorSettings(patch, actor));
});
