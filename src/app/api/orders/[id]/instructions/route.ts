import { generateInstructionsPdf } from "@/lib/instructions/pdf";
import { getOrderModelForInstructions } from "@/lib/orders/service";
import { requireCustomerId, route, type Ctx } from "@/lib/http";

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const o = await getOrderModelForInstructions(await requireCustomerId(), id);
  const pdf = await generateInstructionsPdf(o.frozen_model, {
    title: `Order ${o.id.slice(0, 8)}`,
    modeLabel: o.mode === "simulated" ? "SIMULATED ORDER" : "ORDER",
    validation: o.frozen_validation,
    revisionLabel: "frozen at checkout",
  });
  return new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="order-${o.id.slice(0, 8)}-instructions.pdf"` } });
});
