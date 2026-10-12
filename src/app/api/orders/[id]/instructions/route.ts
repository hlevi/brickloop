import { orderInstructionsPdf } from "@/lib/instructions/creaturePack";
import { requireCustomerId, route, type Ctx } from "@/lib/http";

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { pdf, filename } = await orderInstructionsPdf(await requireCustomerId(), id);
  return new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${filename}"` } });
});
