import { NextResponse } from "next/server";
import { acceptQuote } from "@/lib/orders/service";
import { assertSameOrigin, readJson, requireCustomerId, route, type Ctx } from "@/lib/http";

export const POST = route(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const body = await readJson(req);
  await acceptQuote(await requireCustomerId(), id, { quoteId: body.quoteId, paymentMethod: body.paymentMethod });
  return NextResponse.json({ ok: true });
});
