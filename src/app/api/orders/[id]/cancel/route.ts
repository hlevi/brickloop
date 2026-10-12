import { NextResponse } from "next/server";
import { requestCancel } from "@/lib/orders/service";
import { assertSameOrigin, readJson, requireCustomerId, route, type Ctx } from "@/lib/http";

export const POST = route(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const body = await readJson(req);
  return NextResponse.json(await requestCancel(await requireCustomerId(), id, String(body.reason ?? "").slice(0, 500)));
});
