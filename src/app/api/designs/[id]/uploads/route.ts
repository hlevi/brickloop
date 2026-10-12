import { NextResponse } from "next/server";
import { env } from "@/lib/config";
import { assertSameOrigin, requireCustomerId, route, type Ctx } from "@/lib/http";
import { listUploads, saveUpload } from "@/lib/uploads";
import { AppError } from "@/lib/util";

export const POST = route(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const cid = await requireCustomerId();
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > env.uploadMaxBytes + 64 * 1024) throw new AppError("too_large", "File too large", 413);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("no_file", "No file provided");
  const saved = await saveUpload(cid, id, file.name, Buffer.from(await file.arrayBuffer()));
  return NextResponse.json(saved, { status: 201 });
});

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return NextResponse.json({ uploads: await listUploads(await requireCustomerId(), id) });
});
