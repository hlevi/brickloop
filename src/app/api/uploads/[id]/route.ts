import { getCustomerId, isAdmin, route, type Ctx } from "@/lib/http";
import { readUpload } from "@/lib/uploads";

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const f = await readUpload(await getCustomerId(false), id, await isAdmin());
  return new Response(new Uint8Array(f.data), {
    headers: {
      "content-type": f.mime,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
      "cache-control": "private, max-age=300",
      "content-disposition": "inline",
    },
  });
});
