import { NextResponse } from "next/server";
import { route, setAdminCookie } from "@/lib/http";

export const POST = route(async () => {
  await setAdminCookie(null);
  return NextResponse.json({ ok: true });
});
