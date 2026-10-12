import { NextResponse } from "next/server";
import { reset } from "@/lib/designs";
import { assertSameOrigin, requireCustomerId, route, type Ctx } from "@/lib/http";

export const POST = route(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  await reset(await requireCustomerId(), id);
  return NextResponse.json({ ok: true });
});
