import { getDesignView } from "@/lib/designs";
import { bomToBrickLinkXml, bomToCsv, ExportBlockedError, type Condition } from "@/lib/bom/export";
import { requireCustomerId, route, type Ctx } from "@/lib/http";
import { AppError } from "@/lib/util";

/** GET ?format=csv | xml (&condition=N|U&allowProvisional=1) */
export const GET = route(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const view = await getDesignView(await requireCustomerId(), id);
  const slug = view.name.replace(/[^\w-]+/g, "-").toLowerCase();
  if (url.searchParams.get("format") === "xml") {
    const condition = (url.searchParams.get("condition") ?? "N") as Condition;
    try {
      const xml = bomToBrickLinkXml(view.bom, { condition, allowProvisional: url.searchParams.get("allowProvisional") === "1" });
      return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "content-disposition": `attachment; filename="${slug}-wanted-list.xml"` } });
    } catch (e) {
      if (e instanceof ExportBlockedError) throw new AppError("export_blocked", `${e.message}. Add allowProvisional=1 to export with a warning.`, 409);
      throw e;
    }
  }
  return new Response(bomToCsv(view.bom), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${slug}-parts.csv"` } });
});
