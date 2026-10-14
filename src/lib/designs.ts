import { getDb, type Queryable } from "./db";
import { audit } from "./audit";
import { computeBom } from "./bom/bom";
import { loadMappingLookup } from "./catalog/mappingStore";
import { applyTool, type ToolCall } from "./edit/tools";
import { cardTemplate, defaultCardParams, getCard } from "./cards/catalog";
import { priceTier, tierPriceCents, type PriceTier } from "./cards/pricing";
import { buildModel, defaultParams, isTemplateId } from "./model/templates";
import type { DesignModel, DesignParams, TemplateId } from "./model/types";
import { estimatePrice, type PriceEstimate } from "./pricing/estimate";
import { getSettings } from "./settings";
import { AppError, uuid } from "./util";
import { physicallyValidatedKeys } from "./validation/physical";
import { validateModel, type ValidationResult } from "./validation/validate";

/** The card a design belongs to, as shown to the buyer. */
export interface DesignCard {
  id: string;
  title: string;
  headline: string;
  theme: string;
}

export interface DesignView {
  id: string;
  name: string;
  template: TemplateId;
  revision: { id: string; rev: number; source: string; note: string | null; createdAt: string; canUndo: boolean };
  params: DesignParams;
  model: DesignModel;
  validation: ValidationResult;
  bom: ReturnType<typeof computeBom>;
  /** Supplier-cost estimate (labeled as an estimate; the owner sees it, the buyer sees `priceCents`). */
  estimate: PriceEstimate;
  /** Null for designs that are not cards (only made by tests and scripts). */
  card: DesignCard | null;
  /** Fixed card price for this design's tier, including printing, packing, delivery and taxes. */
  tier: PriceTier;
  priceCents: number;
}

interface DesignRow {
  id: string;
  customer_id: string;
  template: TemplateId;
  name: string;
  current_revision_id: string;
}
interface RevRow {
  id: string;
  rev: number;
  parent_revision_id: string | null;
  params: DesignParams;
  model: DesignModel;
  validation: ValidationResult;
  source: string;
  note: string | null;
  created_at: Date | string;
}

export async function ensureCustomer(q: Queryable, customerId: string) {
  await q.query(`INSERT INTO customers(id) VALUES ($1) ON CONFLICT DO NOTHING`, [customerId]);
}

/** Load a design, enforcing ownership. A design owned by someone else is reported as not found. */
async function loadOwned(q: Queryable, customerId: string, designId: string, lock = false): Promise<DesignRow> {
  const { rows } = await q.query<DesignRow>(`SELECT * FROM designs WHERE id = $1 AND customer_id = $2${lock ? " FOR UPDATE" : ""}`, [designId, customerId]);
  if (!rows[0]) throw new AppError("not_found", "Design not found", 404);
  return rows[0];
}

function deriveModel(params: DesignParams): { model: DesignModel; validation: ValidationResult } {
  const model = buildModel(params);
  return { model, validation: validateModel(model, physicallyValidatedKeys()) };
}

async function insertRevision(q: Queryable, designId: string, params: DesignParams, source: string, note: string | null, parentId: string | null): Promise<string> {
  const { model, validation } = deriveModel(params);
  const { rows } = await q.query<{ n: number }>(`SELECT COALESCE(MAX(rev), 0) + 1 AS n FROM design_revisions WHERE design_id = $1`, [designId]);
  const id = uuid();
  await q.query(
    `INSERT INTO design_revisions(id, design_id, rev, parent_revision_id, params, model, validation, source, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, designId, Number(rows[0].n), parentId, JSON.stringify(params), JSON.stringify(model), JSON.stringify(validation), source, note],
  );
  await q.query(`UPDATE designs SET current_revision_id = $2, updated_at = now() WHERE id = $1`, [designId, id]);
  return id;
}

/** Create a design straight from a kit with its default params (tests and scripts; shoppers start from a card). */
export async function createDesign(customerId: string, template: TemplateId, name?: string): Promise<string> {
  if (!isTemplateId(template)) throw new AppError("invalid_template", "Unknown template");
  return insertDesign(customerId, template, (name ?? template).slice(0, 80), defaultParams(template), "Started from template");
}

/** Apply tool calls strictly: any invalid call fails the whole request (used when a design is created). */
function applyAll(params: DesignParams, calls: ToolCall[]): DesignParams {
  for (const call of calls) {
    const r = applyTool(params, call);
    if (!r.ok) throw new AppError("invalid_edit", r.error, 400);
    params = r.params;
  }
  return params;
}

function cardOrThrow(cardId: unknown) {
  const card = typeof cardId === "string" ? getCard(cardId) : undefined;
  if (!card) throw new AppError("not_found", "Card not found", 404);
  return card;
}

/**
 * Create a design from a catalog card, with the shopper's choices (colors, options,
 * cover, mosaic picture) applied as validated tool calls in the first revision.
 */
export async function createCardDesign(customerId: string, cardId: string, calls: ToolCall[] = []): Promise<string> {
  const card = cardOrThrow(cardId);
  const params = applyAll(defaultCardParams(card), calls);
  return insertDesign(customerId, cardTemplate(card), card.title, params, `Started from the ${card.title} card`);
}

async function insertDesign(customerId: string, template: TemplateId, name: string, params: DesignParams, note: string): Promise<string> {
  const db = await getDb();
  return db.tx(async (q) => {
    await ensureCustomer(q, customerId);
    const id = uuid();
    await q.query(`INSERT INTO designs(id, customer_id, template, name) VALUES ($1,$2,$3,$4)`, [id, customerId, template, name]);
    await insertRevision(q, id, params, "template", note, null);
    await audit(q, `customer:${customerId}`, "design.create", "design", id, { template, cardId: params.card?.cardId ?? null });
    return id;
  });
}

export interface CardPreview {
  params: DesignParams;
  model: DesignModel;
  validation: ValidationResult;
  tier: PriceTier;
  priceCents: number;
}

/** Compile a card with the shopper's choices without saving anything (product page previews). */
export async function previewCard(cardId: string, calls: ToolCall[] = []): Promise<CardPreview> {
  const params = applyAll(defaultCardParams(cardOrThrow(cardId)), calls);
  const { model, validation } = deriveModel(params);
  const tier = priceTier(model);
  return { params, model, validation, tier, priceCents: tierPriceCents(tier, await getSettings()) };
}

function designCard(params: DesignParams): DesignCard | null {
  const card = params.card ? getCard(params.card.cardId) : undefined;
  return card && params.card ? { id: card.id, title: card.title, headline: params.card.headline, theme: params.card.theme } : null;
}

export async function getDesignView(customerId: string, designId: string, q?: Queryable): Promise<DesignView> {
  const db = q ?? (await getDb());
  const d = await loadOwned(db, customerId, designId);
  const { rows } = await db.query<RevRow>(`SELECT * FROM design_revisions WHERE id = $1`, [d.current_revision_id]);
  const r = rows[0];
  const lookup = await loadMappingLookup(db);
  const bom = computeBom(r.model, lookup);
  const tier = priceTier(r.model);
  return {
    id: d.id,
    name: d.name,
    template: d.template,
    revision: { id: r.id, rev: r.rev, source: r.source, note: r.note, createdAt: new Date(r.created_at).toISOString(), canUndo: !!r.parent_revision_id },
    params: r.params,
    model: r.model,
    validation: r.validation,
    bom,
    estimate: estimatePrice(bom),
    card: designCard(r.params),
    tier,
    priceCents: tierPriceCents(tier, await getSettings(q)),
  };
}

export async function listDesigns(customerId: string) {
  const db = await getDb();
  const { rows } = await db.query<{ id: string; name: string; template: TemplateId; updated_at: string; rev: number; pieces: number; params: DesignParams }>(
    `SELECT d.id, d.name, d.template, d.updated_at, r.rev, jsonb_array_length(r.model->'parts') AS pieces, r.params
     FROM designs d JOIN design_revisions r ON r.id = d.current_revision_id WHERE d.customer_id = $1 ORDER BY d.updated_at DESC`,
    [customerId],
  );
  return rows.map(({ params, ...r }) => ({ ...r, card: designCard(params) }));
}

export async function renameDesign(customerId: string, designId: string, name: string) {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new AppError("invalid_name", "Name is required");
  const db = await getDb();
  await loadOwned(db, customerId, designId);
  await db.query(`UPDATE designs SET name = $2, updated_at = now() WHERE id = $1`, [designId, clean]);
}

export interface EditOutcome {
  applied: string[];
  rejected: string[];
}

/** Apply validated tool calls as one new revision. Invalid calls are rejected individually. */
export async function applyEdits(customerId: string, designId: string, calls: ToolCall[], source: "visual" = "visual"): Promise<EditOutcome> {
  const db = await getDb();
  return db.tx(async (q) => {
    const d = await loadOwned(q, customerId, designId, true);
    const { rows } = await q.query<RevRow>(`SELECT * FROM design_revisions WHERE id = $1`, [d.current_revision_id]);
    let params = rows[0].params;
    const applied: string[] = [];
    const rejected: string[] = [];
    for (const call of calls) {
      const r = applyTool(params, call);
      if (r.ok) {
        params = r.params;
        applied.push(r.summary);
      } else rejected.push(r.error);
    }
    if (applied.length) {
      await insertRevision(q, designId, params, source, applied.join("; "), d.current_revision_id);
      // Only counts go to the audit log: summaries and errors can echo shopper text (headlines).
      await audit(q, `customer:${customerId}`, "design.edit", "design", designId, { source, applied: applied.length, rejected: rejected.length });
    }
    return { applied, rejected };
  });
}

export async function undo(customerId: string, designId: string) {
  const db = await getDb();
  await db.tx(async (q) => {
    const d = await loadOwned(q, customerId, designId, true);
    const { rows } = await q.query<{ parent_revision_id: string | null }>(`SELECT parent_revision_id FROM design_revisions WHERE id = $1`, [d.current_revision_id]);
    const parent = rows[0]?.parent_revision_id;
    if (!parent) throw new AppError("nothing_to_undo", "Nothing to undo", 409);
    await q.query(`UPDATE designs SET current_revision_id = $2, updated_at = now() WHERE id = $1`, [designId, parent]);
  });
}

export async function reset(customerId: string, designId: string) {
  const db = await getDb();
  await db.tx(async (q) => {
    const d = await loadOwned(q, customerId, designId, true);
    const cur = await q.query<{ params: DesignParams }>(`SELECT params FROM design_revisions WHERE id = $1`, [d.current_revision_id]);
    // A card design resets to its card's defaults (cover included); anything else to the kit defaults.
    const card = cur.rows[0]?.params.card ? getCard(cur.rows[0].params.card.cardId) : undefined;
    const params = card ? defaultCardParams(card) : defaultParams(d.template);
    await insertRevision(q, designId, params, "reset", card ? "Reset to the card's defaults" : "Reset to template defaults", d.current_revision_id);
  });
}
