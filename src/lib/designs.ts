import { getDb, type Queryable } from "./db";
import { audit } from "./audit";
import { computeBom } from "./bom/bom";
import { loadMappingLookup } from "./catalog/mappingStore";
import { env } from "./config";
import { planWithLlm, type ChatTurn } from "./edit/llm";
import { planFromMessage, type ChatPlan } from "./edit/mockChat";
import { applyTool, type ToolCall } from "./edit/tools";
import { buildModel, defaultParams, getKit, isLabKit, TEMPLATES } from "./model/templates";
import { renderName } from "./creature/words";
import { creatureStats, type CreatureStats } from "./creature/stats";
import type { DesignModel, DesignParams, TemplateId } from "./model/types";
import { estimatePrice, type PriceEstimate } from "./pricing/estimate";
import { log } from "./redact";
import { AppError, uuid } from "./util";
import { physicallyValidatedKeys } from "./validation/physical";
import { validateModel, type ValidationResult } from "./validation/validate";

export interface DesignView {
  id: string;
  name: string;
  template: TemplateId;
  revision: { id: string; rev: number; source: string; note: string | null; createdAt: string; canUndo: boolean };
  params: DesignParams;
  model: DesignModel;
  validation: ValidationResult;
  bom: ReturnType<typeof computeBom>;
  estimate: PriceEstimate;
  /** Lab kits only. */
  lab: boolean;
  stats: CreatureStats | null;
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

export async function createDesign(customerId: string, template: TemplateId, name?: string): Promise<string> {
  if (!TEMPLATES.some((t) => t.id === template) && !isLabKit(template)) throw new AppError("invalid_template", "Unknown template");
  const db = await getDb();
  return db.tx(async (q) => {
    await ensureCustomer(q, customerId);
    const id = uuid();
    // Lab kits never accept a free-text name; they are named from word reels.
    const title = (isLabKit(template) ? getKit(template).name : (name ?? TEMPLATES.find((t) => t.id === template)!.name)).slice(0, 80);
    await q.query(`INSERT INTO designs(id, customer_id, template, name) VALUES ($1,$2,$3,$4)`, [id, customerId, template, title]);
    await insertRevision(q, id, defaultParams(template), "template", "Started from template", null);
    await audit(q, `customer:${customerId}`, "design.create", "design", id, { template });
    return id;
  });
}

/**
 * Copy one frozen revision into a NEW design owned by `customerId` (used when a
 * grown-up claims a kid's wish). The params, model and validation are copied
 * exactly, so the structuralKey and every brick match what was frozen, even if
 * the kit compiler changes later. The source design is never touched. Pass `q`
 * to run inside the caller's transaction.
 */
export async function createDesignFromRevision(customerId: string, revisionId: string, source: "wish", opts: { note?: string; q?: Queryable } = {}): Promise<string> {
  const run = async (q: Queryable) => {
    const { rows } = await q.query<{ params: DesignParams; model: DesignModel; validation: ValidationResult; template: TemplateId; name: string }>(
      `SELECT r.params, r.model, r.validation, d.template, d.name FROM design_revisions r JOIN designs d ON d.id = r.design_id WHERE r.id = $1`,
      [revisionId],
    );
    const src = rows[0];
    if (!src) throw new AppError("not_found", "Design not found", 404);
    await ensureCustomer(q, customerId);
    const id = uuid();
    const name = (isLabKit(src.template) ? (src.params.identity ? renderName(src.params.identity) : getKit(src.template).name) : src.name).slice(0, 80);
    await q.query(`INSERT INTO designs(id, customer_id, template, name) VALUES ($1,$2,$3,$4)`, [id, customerId, src.template, name]);
    const revId = uuid();
    await q.query(
      `INSERT INTO design_revisions(id, design_id, rev, parent_revision_id, params, model, validation, source, note) VALUES ($1,$2,1,NULL,$3,$4,$5,$6,$7)`,
      [revId, id, JSON.stringify(src.params), JSON.stringify(src.model), JSON.stringify(src.validation), source, opts.note ?? "Copied from a frozen revision"],
    );
    await q.query(`UPDATE designs SET current_revision_id = $2, updated_at = now() WHERE id = $1`, [id, revId]);
    await audit(q, `customer:${customerId}`, "design.create_from_revision", "design", id, { source, template: src.template });
    return id;
  };
  if (opts.q) return run(opts.q);
  const db = await getDb();
  return db.tx(run);
}

export async function getDesignView(customerId: string, designId: string, q?: Queryable): Promise<DesignView> {
  const db = q ?? (await getDb());
  const d = await loadOwned(db, customerId, designId);
  const { rows } = await db.query<RevRow>(`SELECT * FROM design_revisions WHERE id = $1`, [d.current_revision_id]);
  const r = rows[0];
  const lookup = await loadMappingLookup(db);
  const bom = computeBom(r.model, lookup);
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
    lab: isLabKit(d.template),
    stats: isLabKit(d.template) ? creatureStats(r.model) : null,
  };
}

export async function listDesigns(customerId: string) {
  const db = await getDb();
  // `claimed`: a grown-up's copy made by claiming a wish. It opens on its checkout or order, never in the kid Lab.
  const { rows } = await db.query<{ id: string; name: string; template: TemplateId; updated_at: string; rev: number; pieces: number; claimed: boolean }>(
    `SELECT d.id, d.name, d.template, d.updated_at, r.rev, jsonb_array_length(r.model->'parts') AS pieces,
            EXISTS (SELECT 1 FROM wish_claims c WHERE c.design_id = d.id) AS claimed
     FROM designs d JOIN design_revisions r ON r.id = d.current_revision_id WHERE d.customer_id = $1 ORDER BY d.updated_at DESC`,
    [customerId],
  );
  return rows;
}

export async function renameDesign(customerId: string, designId: string, name: string) {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new AppError("invalid_name", "Name is required");
  const db = await getDb();
  const d = await loadOwned(db, customerId, designId);
  if (isLabKit(d.template)) throw new AppError("not_found", "Not found", 404);
  await db.query(`UPDATE designs SET name = $2, updated_at = now() WHERE id = $1`, [designId, clean]);
}

export interface EditOutcome {
  applied: string[];
  rejected: string[];
}

/** Apply validated tool calls as one new revision. Invalid calls are rejected individually. */
export async function applyEdits(customerId: string, designId: string, calls: ToolCall[], source: "visual" | "chat"): Promise<EditOutcome> {
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
      if (isLabKit(d.template) && params.identity) await q.query(`UPDATE designs SET name = $2 WHERE id = $1`, [designId, renderName(params.identity)]);
      await audit(q, `customer:${customerId}`, "design.edit", "design", designId, { source, applied, rejected });
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
    if (isLabKit(d.template)) {
      const pr = await q.query<{ params: DesignParams }>(`SELECT params FROM design_revisions WHERE id = $1`, [parent]);
      await q.query(`UPDATE designs SET name = $2 WHERE id = $1`, [designId, pr.rows[0]?.params.identity ? renderName(pr.rows[0].params.identity) : getKit(d.template).name]);
    }
  });
}

export async function reset(customerId: string, designId: string) {
  const db = await getDb();
  await db.tx(async (q) => {
    const d = await loadOwned(q, customerId, designId, true);
    await insertRevision(q, designId, defaultParams(d.template), "reset", "Reset to template defaults", d.current_revision_id);
  });
}

export interface ChatResponse {
  reply: string;
  applied: string[];
  rejected: string[];
  mode: "mock" | "llm";
}

export async function chat(customerId: string, designId: string, message: string): Promise<ChatResponse> {
  const text = message.trim().slice(0, 1000);
  if (!text) throw new AppError("empty_message", "Message is empty");
  const db = await getDb();
  const view = await getDesignView(customerId, designId);
  if (view.lab) throw new AppError("not_found", "Not found", 404);
  const historyRows = await db.query<{ role: "user" | "assistant"; content: string }>(
    `SELECT role, content FROM design_messages WHERE design_id = $1 ORDER BY id DESC LIMIT 10`,
    [designId],
  );
  const history: ChatTurn[] = historyRows.rows.reverse();
  let mode = env.chatMode;
  let plan: ChatPlan;
  if (mode === "llm") {
    try {
      plan = await planWithLlm(history, text, view.params);
    } catch (e) {
      log.warn(`LLM chat failed, falling back to mock planner: ${e instanceof Error ? e.message : e}`);
      mode = "mock";
      plan = planFromMessage(text, view.params);
    }
  } else plan = planFromMessage(text, view.params);

  let applied: string[] = [];
  let rejected: string[] = [];
  let reply = plan.reply ?? "";
  if (plan.control === "undo") {
    await undo(customerId, designId);
    reply = "Undone. The previous version is back.";
  } else if (plan.control === "reset") {
    await reset(customerId, designId);
    reply = "Reset to the original template.";
  } else if (plan.calls.length) {
    ({ applied, rejected } = await applyEdits(customerId, designId, plan.calls, "chat"));
    const parts: string[] = [];
    if (applied.length) parts.push(`Done: ${applied.join(", ")}.`);
    if (rejected.length) parts.push(`Not applied: ${rejected.join(" ")}`);
    if (plan.reply && mode === "mock") parts.push(plan.reply);
    if (mode === "llm" && plan.reply && !rejected.length) parts.unshift(plan.reply);
    reply = parts.join(" ");
  }
  if (!reply) reply = "No changes made.";
  await db.query(`INSERT INTO design_messages(design_id, role, content, mode) VALUES ($1,'user',$2,$3)`, [designId, text, mode]);
  await db.query(`INSERT INTO design_messages(design_id, role, content, tool_calls, mode) VALUES ($1,'assistant',$2,$3,$4)`, [
    designId,
    reply,
    JSON.stringify(plan.calls),
    mode,
  ]);
  return { reply, applied, rejected, mode };
}

export async function chatHistory(customerId: string, designId: string) {
  const db = await getDb();
  const d = await loadOwned(db, customerId, designId);
  if (isLabKit(d.template)) throw new AppError("not_found", "Not found", 404);
  const { rows } = await db.query<{ role: string; content: string; mode: string; created_at: string }>(
    `SELECT role, content, mode, created_at FROM design_messages WHERE design_id = $1 ORDER BY id ASC LIMIT 200`,
    [designId],
  );
  return rows;
}

/** Price-aware suggestions: supported edits that bring the estimate under a budget. */
export async function budgetSuggestions(customerId: string, designId: string, budgetCents: number) {
  const view = await getDesignView(customerId, designId);
  // Lab kits have thousands of combinations and a fixed price: no suggestions.
  if (view.lab) return { currentCents: view.estimate.totalCents, budgetCents, withinBudget: true, suggestions: [] as { label: string; calls: ToolCall[]; estimateCents: number }[] };
  const lookup = await loadMappingLookup();
  // Every combination of build options (colors don't change price meaningfully).
  const kit = getKit(view.params.template);
  let combos: Record<string, string>[] = [{}];
  for (const o of kit.options) combos = combos.flatMap((c) => o.values.map((v) => ({ ...c, [o.id]: v.id })));
  const p = view.params;
  const candidates: { label: string; calls: ToolCall[] }[] = combos
    .filter((c) => kit.options.some((o) => c[o.id] !== p.options[o.id]))
    .map((c) => ({
      label: kit.options.map((o) => o.values.find((v) => v.id === c[o.id])!.label).join(", "),
      calls: kit.options.filter((o) => c[o.id] !== p.options[o.id]).map((o) => ({ name: "set_option", input: { option: o.id, value: c[o.id] } })),
    }));
  const out = candidates.map((c) => {
    let params = p;
    for (const call of c.calls) {
      const r = applyTool(params, call);
      if (r.ok) params = r.params;
    }
    const est = estimatePrice(computeBom(buildModel(params), lookup));
    return { ...c, estimateCents: est.totalCents };
  });
  return {
    currentCents: view.estimate.totalCents,
    budgetCents,
    withinBudget: view.estimate.totalCents <= budgetCents,
    suggestions: out.filter((s) => s.estimateCents <= budgetCents).sort((a, b) => b.estimateCents - a.estimateCents).slice(0, 4),
  };
}
