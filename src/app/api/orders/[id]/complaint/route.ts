import { NextResponse } from "next/server";
import { reportMissingPiece } from "@/lib/orders/service";
import { assertSameOrigin, readJson, requireCustomerId, route, type Ctx } from "@/lib/http";
import { AppError } from "@/lib/util";

export const POST = route(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const body = await readJson(req);
  const details = String(body.details ?? "").trim();
  if (details.length < 3) throw new AppError("invalid", "Describe which pieces are missing");
  await reportMissingPiece(await requireCustomerId(), id, details);
  return NextResponse.json({ ok: true });
});
