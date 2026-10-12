import { NextResponse } from "next/server";
import { applyEdits } from "@/lib/designs";
import { assertSameOrigin, readJson, requireCustomerId, route, type Ctx } from "@/lib/http";
import { AppError } from "@/lib/util";

export const POST = route(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const cid = await requireCustomerId();
  const body = await readJson(req);
  const calls = Array.isArray(body.calls) ? body.calls.slice(0, 10) : null;
  if (!calls) throw new AppError("invalid_calls", "calls must be an array");
  const clean = calls.map((c: unknown) => {
    const o = (c ?? {}) as Record<string, unknown>;
    return { name: String(o.name ?? ""), input: (o.input && typeof o.input === "object" ? o.input : {}) as Record<string, unknown> };
  });
  return NextResponse.json(await applyEdits(cid, id, clean, "visual"));
});
