import { NextResponse } from "next/server";
import { applyEdits } from "@/lib/designs";
import { parseToolCalls } from "@/lib/edit/tools";
import { assertSameOrigin, readJson, requireCustomerId, route, type Ctx } from "@/lib/http";
import { AppError } from "@/lib/util";

export const POST = route(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const cid = await requireCustomerId();
  const body = await readJson(req);
  const calls = parseToolCalls(body.calls);
  if (!calls) throw new AppError("invalid_calls", "calls must be an array of at most 24 edits");
  return NextResponse.json(await applyEdits(cid, id, calls));
});
