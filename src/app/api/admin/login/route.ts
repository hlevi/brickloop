import { NextResponse } from "next/server";
import { checkAdminPassword, newAdminToken } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertSameOrigin, readJson, route, setAdminCookie } from "@/lib/http";
import { AppError } from "@/lib/util";

const attempts = new Map<string, { n: number; until: number }>();

export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const a = attempts.get(ip);
  if (a && a.until > Date.now() && a.n >= 5) throw new AppError("rate_limited", "Too many attempts; try again later", 429);
  const body = await readJson(req);
  const ok = checkAdminPassword(String(body.password ?? ""));
  const db = await getDb();
  await db.tx((q) => audit(q, "admin", ok ? "admin.login" : "admin.login_failed", "admin", null, { ip }));
  if (!ok) {
    attempts.set(ip, { n: (a && a.until > Date.now() ? a.n : 0) + 1, until: Date.now() + 15 * 60_000 });
    throw new AppError("bad_credentials", "Invalid password (admin is disabled until ADMIN_PASSWORD of 12+ characters is set)", 401);
  }
  attempts.delete(ip);
  await setAdminCookie(newAdminToken());
  return NextResponse.json({ ok: true });
});
