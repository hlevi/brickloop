/** Instruction PDFs for the API routes. Purchaser contact details never reach these files. */
import { loadMappingLookup } from "../catalog/mappingStore";
import { getDesignView } from "../designs";
import { getOrderModelForInstructions } from "../orders/service";
import { generateInstructionsPdf } from "./pdf";

export interface InstructionsFile {
  pdf: Uint8Array;
  filename: string;
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "card"
  );
}

/** GET /api/orders/[id]/instructions (owner only): the booklet for the frozen model. */
export async function orderInstructionsPdf(customerId: string, orderId: string): Promise<InstructionsFile> {
  const o = await getOrderModelForInstructions(customerId, orderId);
  const title = o.card?.title ?? `Order ${o.id.slice(0, 8)}`;
  const pdf = await generateInstructionsPdf(o.frozen_model, {
    title,
    modeLabel: o.mode === "simulated" ? "SIMULATED ORDER" : "ORDER",
    validation: o.frozen_validation,
    revisionLabel: "frozen at checkout",
  });
  return { pdf, filename: `${slug(title)}-instructions.pdf` };
}

/** GET /api/designs/[id]/instructions (owner only): a preview booklet for the current revision. */
export async function designInstructionsPdf(customerId: string, designId: string): Promise<InstructionsFile> {
  const view = await getDesignView(customerId, designId);
  const pdf = await generateInstructionsPdf(view.model, {
    title: view.card?.title ?? view.name,
    modeLabel: "DESIGN PREVIEW - NOT AN ORDER",
    validation: view.validation,
    lookup: await loadMappingLookup(),
    revisionLabel: `revision ${view.revision.rev}`,
  });
  return { pdf, filename: `${slug(view.card?.title ?? view.name)}-preview.pdf` };
}
