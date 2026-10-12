import { NextResponse } from "next/server";
import { chat, chatHistory } from "@/lib/designs";
import { assertSameOrigin, readJson, requireCustomerId, route, type Ctx } from "@/lib/http";

export const POST = route(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const body = await readJson(req);
  return NextResponse.json(await chat(await requireCustomerId(), id, String(body.message ?? "")));
});

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return NextResponse.json({ messages: await chatHistory(await requireCustomerId(), id) });
});
