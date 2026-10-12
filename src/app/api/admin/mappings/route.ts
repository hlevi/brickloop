import { NextResponse } from "next/server";
import { setMapping } from "@/lib/catalog/mappingStore";
import { assertSameOrigin, readJson, requireAdmin, route } from "@/lib/http";

export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const actor = await requireAdmin();
  const b = await readJson(req);
  await setMapping(
    {
      partId: String(b.partId ?? ""),
      colorId: String(b.colorId ?? ""),
      externalItemId: String(b.externalItemId ?? ""),
      externalColorId: Number(b.externalColorId),
      status: b.status === "unresolved" ? "unresolved" : "verified",
      source: String(b.source ?? ""),
    },
    actor,
  );
  return NextResponse.json({ ok: true });
});
