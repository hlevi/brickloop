import { NextResponse } from "next/server";
import { getDesignView, renameDesign } from "@/lib/designs";
import { summarizeSteps } from "@/lib/instructions/steps";
import { listUploads } from "@/lib/uploads";
import { assertSameOrigin, readJson, requireCustomerId, route, type Ctx } from "@/lib/http";

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const cid = await requireCustomerId();
  const view = await getDesignView(cid, id);
  return NextResponse.json({ ...view, steps: summarizeSteps(view.model), uploads: await listUploads(cid, id) });
});

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const cid = await requireCustomerId();
  const body = await readJson(req);
  await renameDesign(cid, id, String(body.name ?? ""));
  return NextResponse.json({ ok: true });
});
