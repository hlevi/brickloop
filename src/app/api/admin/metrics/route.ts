import { NextResponse } from "next/server";
import { pilotMetrics } from "@/lib/metrics";
import { requireAdmin, route } from "@/lib/http";

export const GET = route(async () => {
  await requireAdmin();
  return NextResponse.json(await pilotMetrics());
});
