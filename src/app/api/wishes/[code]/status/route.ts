import { NextResponse } from "next/server";
import { kidStatus } from "@/lib/wishes";
import { assertRateLimit, requireCustomerId, route, type Ctx } from "@/lib/http";

/**
 * Kid status: only {stage, slow}, never price, contact, address or order id, and
 * 404 unless the caller's cookie owns the wish's source design. The wish card polls
 * this every 10 s while visible, so it has its own, roomier bucket.
 */
export const GET = route(async (req: Request, ctx: Ctx<"code">) => {
  assertRateLimit(req.headers, "wish-status", 60);
  const { code } = await ctx.params;
  const cid = await requireCustomerId();
  const { stage, slow } = await kidStatus(cid, code);
  return NextResponse.json({ stage, slow }, { headers: { "cache-control": "no-store" } });
});
