import { NextResponse } from "next/server";
import { handleWebhook } from "@/lib/webhooks";
import { route } from "@/lib/http";
import { AppError } from "@/lib/util";

export const POST = route(async (req: Request, ctx: { params: Promise<{ provider: string }> }) => {
  const { provider } = await ctx.params;
  const body = await req.text();
  if (body.length > 256 * 1024) throw new AppError("too_large", "Payload too large", 413);
  const r = await handleWebhook(provider, body, req.headers.get("x-brickloop-signature"));
  return NextResponse.json({ received: true, duplicate: r.duplicate });
});
