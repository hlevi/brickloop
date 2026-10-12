import { NextResponse } from "next/server";
import { resolveException } from "@/lib/exceptions/resolve";
import type { ResolutionAction } from "@/lib/exceptions/service";
import { assertSameOrigin, readJson, requireAdmin, route, type Ctx } from "@/lib/http";

export const POST = route(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  const actor = await requireAdmin();
  const { id } = await ctx.params;
  const body = await readJson(req);
  const r = await resolveException(
    { exceptionId: id, action: String(body.action) as ResolutionAction, note: typeof body.note === "string" ? body.note : undefined, ownerMinutes: body.ownerMinutes === undefined ? null : Number(body.ownerMinutes) },
    actor,
  );
  return NextResponse.json(r);
});
