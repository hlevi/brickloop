import { NextResponse } from "next/server";
import { createCardDesign, listDesigns } from "@/lib/designs";
import { parseToolCalls } from "@/lib/edit/tools";
import { assertSameOrigin, getCustomerId, readJson, route } from "@/lib/http";
import { AppError } from "@/lib/util";

/** Save a card with the shopper's choices: { cardId, calls? } -> { id }. */
export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const body = await readJson(req);
  if (typeof body.cardId !== "string") throw new AppError("invalid_card", "cardId is required");
  const calls = body.calls === undefined ? [] : parseToolCalls(body.calls);
  if (!calls) throw new AppError("invalid_calls", "calls must be an array of at most 24 edits");
  const cid = (await getCustomerId(true))!;
  const id = await createCardDesign(cid, body.cardId, calls);
  return NextResponse.json({ id }, { status: 201 });
});

export const GET = route(async () => {
  const cid = await getCustomerId(false);
  return NextResponse.json({ designs: cid ? await listDesigns(cid) : [] });
});
