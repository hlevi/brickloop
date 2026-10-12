import { NextResponse } from "next/server";
import { budgetSuggestions } from "@/lib/designs";
import { requireCustomerId, route, type Ctx } from "@/lib/http";
import { AppError } from "@/lib/util";

export const GET = route(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const cents = Number(new URL(req.url).searchParams.get("cents"));
  if (!Number.isInteger(cents) || cents <= 0) throw new AppError("invalid_budget", "Budget must be a positive number of cents");
  return NextResponse.json(await budgetSuggestions(await requireCustomerId(), id, cents));
});
