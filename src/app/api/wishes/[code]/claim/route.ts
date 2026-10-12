import { NextResponse } from "next/server";
import { claimWish } from "@/lib/wishes";
import { assertRateLimit, assertSameOrigin, getCustomerId, route, type Ctx } from "@/lib/http";

/** "Order these bricks": copy the frozen creature into the grown-up's own session (cookie created on demand). */
export const POST = route(async (req: Request, ctx: Ctx<"code">) => {
  assertSameOrigin(req);
  assertRateLimit(req.headers, "wish-lookup", 30);
  const { code } = await ctx.params;
  const cid = (await getCustomerId(true))!;
  return NextResponse.json(await claimWish(cid, code), { headers: { "cache-control": "no-store" } });
});
