import { NextResponse } from "next/server";
import { listExceptions } from "@/lib/exceptions/service";
import { requireAdmin, route } from "@/lib/http";

export const GET = route(async (req: Request) => {
  await requireAdmin();
  const s = new URL(req.url).searchParams.get("status");
  return NextResponse.json({ exceptions: await listExceptions(s === "resolved" || s === "all" ? s : "open") });
});
