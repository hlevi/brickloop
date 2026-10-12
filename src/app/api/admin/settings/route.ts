import { NextResponse } from "next/server";
import { getSettings, updateSettings, type OperatingSettings } from "@/lib/settings";
import { assertSameOrigin, readJson, requireAdmin, route } from "@/lib/http";

export const GET = route(async () => {
  await requireAdmin();
  return NextResponse.json(await getSettings());
});

export const PUT = route(async (req: Request) => {
  assertSameOrigin(req);
  const actor = await requireAdmin();
  const body = (await readJson(req)) as Partial<OperatingSettings>;
  return NextResponse.json(await updateSettings(body, actor));
});
