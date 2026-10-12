import { NextResponse } from "next/server";
import { kidStatus } from "@/lib/wishes";
import { assertRateLimitKey, requireCustomerId, route, type Ctx } from "@/lib/http";

/**
 * Kid status: only {stage, slow}, never price, contact, address or order id, and
 * 404 unless the caller's cookie owns the wish's source design. The wish card polls
 * this every 10 s while visible. It reveals nothing to anyone else, so it is limited
 * per session rather than per IP (a classroom shares one IP).
 */
export const GET = route(async (_req: Request, ctx: Ctx<"code">) => {
  const { code } = await ctx.params;
  const cid = await requireCustomerId();
  assertRateLimitKey(`wish-status:${cid}`, 30);
  const { stage, slow } = await kidStatus(cid, code);
  return NextResponse.json({ stage, slow }, { headers: { "cache-control": "no-store" } });
});
