import { NextResponse } from "next/server";
import { computeEnvironmental } from "@/lib/orders/view";
import { getCustomerOrder } from "@/lib/orders/service";
import { requireCustomerId, route, type Ctx } from "@/lib/http";

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const view = await getCustomerOrder(await requireCustomerId(), id);
  return NextResponse.json({ ...view, environmental: computeEnvironmental(view) });
});
