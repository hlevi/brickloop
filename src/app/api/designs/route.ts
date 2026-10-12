import { NextResponse } from "next/server";
import { createDesign, listDesigns } from "@/lib/designs";
import { isTemplateId } from "@/lib/model/templates";
import { assertSameOrigin, getCustomerId, readJson, route } from "@/lib/http";
import { AppError } from "@/lib/util";

export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const body = await readJson(req);
  if (!isTemplateId(body.template)) throw new AppError("invalid_template", "Unknown template");
  const cid = (await getCustomerId(true))!;
  const id = await createDesign(cid, body.template, typeof body.name === "string" ? body.name : undefined);
  return NextResponse.json({ id }, { status: 201 });
});

export const GET = route(async () => {
  const cid = await getCustomerId(false);
  return NextResponse.json({ designs: cid ? await listDesigns(cid) : [] });
});
