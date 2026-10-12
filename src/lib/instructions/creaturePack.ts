/**
 * Builds instruction PDFs for the API routes. Lab-kit (creature) designs and
 * orders get the personalized Creature Pack; ready-made kits keep the plain
 * booklet. The creature block is made only from the frozen model (identity,
 * core color, bricks) plus a serial and a born date: the adult purchaser's
 * name, email and address never reach the PDF.
 */
import { COLORS } from "../catalog/colors";
import { loadMappingLookup } from "../catalog/mappingStore";
import { creatureStats } from "../creature/stats";
import { isValidIdentity, powerOf, renderBuilder, renderName } from "../creature/words";
import { getDb } from "../db";
import { getDesignView } from "../designs";
import { isLabKit } from "../model/templates";
import type { DesignModel } from "../model/types";
import { getOrderModelForInstructions } from "../orders/service";
import { generateInstructionsPdf, type CreaturePackInfo } from "./pdf";
import { creatureSerial } from "./serial";

export interface InstructionsFile {
  pdf: Uint8Array;
  filename: string;
}

/** The creature block for a lab-kit model, or undefined for ready-made kits. */
export function creaturePackInfo(model: DesignModel, opts: { serial: string | null; bornOn: Date | string }): CreaturePackInfo | undefined {
  if (!isLabKit(model.template)) return undefined;
  const identity = isValidIdentity(model.params.identity) ? model.params.identity : undefined;
  const power = powerOf(model.params.colors.core);
  return {
    name: renderName(identity),
    builder: renderBuilder(identity),
    serial: opts.serial,
    bornOn: opts.bornOn,
    power: { label: power.label, colorHex: COLORS[power.colorId]?.hex ?? "#AEEFEC" },
    stats: creatureStats(model),
  };
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "creature"
  );
}

/**
 * When the creature was born: the moment the kid made the version the
 * grown-up ordered (the wish's frozen revision), falling back to the order's
 * own design revision.
 */
async function orderBornOn(o: { design_revision_id: string; wish_code: string | null; created_at: string }): Promise<Date | string> {
  const db = await getDb();
  if (o.wish_code) {
    const w = await db.query<{ created_at: Date | string }>(
      `SELECT r.created_at FROM wishes w JOIN design_revisions r ON r.id = w.design_revision_id WHERE w.code = $1`,
      [o.wish_code],
    );
    if (w.rows[0]) return w.rows[0].created_at;
  }
  const r = await db.query<{ created_at: Date | string }>(`SELECT created_at FROM design_revisions WHERE id = $1`, [o.design_revision_id]);
  return r.rows[0]?.created_at ?? o.created_at;
}

/** GET /api/orders/[id]/instructions (owner only). */
export async function orderInstructionsPdf(customerId: string, orderId: string): Promise<InstructionsFile> {
  const o = await getOrderModelForInstructions(customerId, orderId);
  const modeLabel = o.mode === "simulated" ? "SIMULATED ORDER" : "ORDER";
  if (isLabKit(o.frozen_model.template)) {
    const creature = creaturePackInfo(o.frozen_model, { serial: creatureSerial(o.id), bornOn: await orderBornOn(o) })!;
    const pdf = await generateInstructionsPdf(o.frozen_model, {
      title: creature.name,
      modeLabel,
      validation: o.frozen_validation,
      revisionLabel: "frozen at checkout",
      creature,
    });
    return { pdf, filename: `${slug(creature.name)}-creature-pack.pdf` };
  }
  const pdf = await generateInstructionsPdf(o.frozen_model, {
    title: `Order ${o.id.slice(0, 8)}`,
    modeLabel,
    validation: o.frozen_validation,
    revisionLabel: "frozen at checkout",
  });
  return { pdf, filename: `order-${o.id.slice(0, 8)}-instructions.pdf` };
}

/** GET /api/designs/[id]/instructions (owner only). Creature previews print "PREVIEW" instead of a serial. */
export async function designInstructionsPdf(customerId: string, designId: string): Promise<InstructionsFile> {
  const view = await getDesignView(customerId, designId);
  const lookup = await loadMappingLookup();
  const modeLabel = "DESIGN PREVIEW - NOT AN ORDER";
  if (view.lab) {
    const creature = creaturePackInfo(view.model, { serial: null, bornOn: view.revision.createdAt })!;
    // No revision numbers: the Lab may link here, and kids never see them.
    const pdf = await generateInstructionsPdf(view.model, { title: creature.name, modeLabel, validation: view.validation, lookup, creature });
    return { pdf, filename: `${slug(creature.name)}-preview.pdf` };
  }
  const pdf = await generateInstructionsPdf(view.model, {
    title: view.name,
    modeLabel,
    validation: view.validation,
    lookup,
    revisionLabel: `revision ${view.revision.rev}`,
  });
  return { pdf, filename: "instructions.pdf" };
}
