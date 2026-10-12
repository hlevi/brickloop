import { NextResponse } from "next/server";
import { getWishForGrownup } from "@/lib/wishes";
import { assertRateLimit, route, type Ctx } from "@/lib/http";

/** Grown-up page data (creature only). Rate limited per IP: codes are short, so lookups must be too. */
export const GET = route(async (req: Request, ctx: Ctx<"code">) => {
  assertRateLimit(req.headers, "wish-lookup", 30);
  const { code } = await ctx.params;
  return NextResponse.json(await getWishForGrownup(code), { headers: { "cache-control": "no-store" } });
});
