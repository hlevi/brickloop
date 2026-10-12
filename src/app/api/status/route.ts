import { NextResponse } from "next/server";
import { env } from "@/lib/config";
import { liveReadiness } from "@/lib/orders/live";
import { route } from "@/lib/http";

export const GET = route(async () => {
  const r = await liveReadiness();
  return NextResponse.json({ mode: r.ready ? "live" : "simulation", chatMode: env.chatMode, supplier: r.ready ? env.supplier : "simulator" });
});
