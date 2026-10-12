import { getDesignView } from "@/lib/designs";
import { generateInstructionsPdf } from "@/lib/instructions/pdf";
import { loadMappingLookup } from "@/lib/catalog/mappingStore";
import { requireCustomerId, route, type Ctx } from "@/lib/http";

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const view = await getDesignView(await requireCustomerId(), id);
  const pdf = await generateInstructionsPdf(view.model, {
    title: view.name,
    modeLabel: "DESIGN PREVIEW - NOT AN ORDER",
    validation: view.validation,
    lookup: await loadMappingLookup(),
    revisionLabel: `revision ${view.revision.rev}`,
  });
  return new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="instructions.pdf"` } });
});
