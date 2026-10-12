import { NextResponse } from "next/server";
import { createWish } from "@/lib/wishes";
import { assertRateLimit, assertSameOrigin, readJson, requireCustomerId, route, type Ctx } from "@/lib/http";

/** Kid side: "Show a grown-up". Takes only a note id from a fixed enum; never a name, email or phone. */
export const POST = route(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  assertRateLimit(req.headers, "wish-create", 30);
  const { id } = await ctx.params;
  const cid = await requireCustomerId();
  const body = await readJson(req, 1024);
  const wish = await createWish(cid, id, body.note ?? "invented");
  return NextResponse.json(wish, { status: 201, headers: { "cache-control": "no-store" } });
});
