import { NextResponse } from "next/server";
import { createWish, openWish } from "@/lib/wishes";
import { assertRateLimit, assertRateLimitKey, assertSameOrigin, readJson, requireCustomerId, route, type Ctx } from "@/lib/http";

/**
 * Kid side: "Show a grown-up". Takes only a note id from a fixed enum; never a name,
 * email or phone. Without a note it opens the wish for the creature on screen and
 * keeps the sticker the kid already picked.
 */
export const POST = route(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  // Per session for the kid, plus a roomier per-IP ceiling (a classroom shares one IP).
  assertRateLimit(req.headers, "wish-create", 120);
  const { id } = await ctx.params;
  const cid = await requireCustomerId();
  assertRateLimitKey(`wish-create:${cid}`, 30);
  const body = await readJson(req, 1024);
  const wish = body.note === undefined ? await openWish(cid, id) : await createWish(cid, id, body.note);
  return NextResponse.json(wish, { status: 201, headers: { "cache-control": "no-store" } });
});
