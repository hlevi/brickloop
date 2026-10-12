/**
 * "Show a grown-up": wishes connect a kid's creature to a grown-up who may buy it.
 *
 * Safety rules (see docs/CREATURE_LAB.md):
 * - A wish holds no personal data: a random code, a note id from a fixed enum and
 *   a frozen design revision. The kid device never sends a name, email or phone.
 * - The grown-up view returns creature data only (model, stats, generated name and
 *   builder tag, note). It never reveals the kid's design id or anything else.
 * - The kid status returns only {stage, slow}, and only to the cookie that owns
 *   the source design. Codes are random (~40 bits), rate-limited at the routes and
 *   expire after 30 days unless ordered.
 */
import crypto from "node:crypto";
import { getDb, type Queryable } from "./db";
import { audit } from "./audit";
import { getPart } from "./catalog/parts";
import { createDesignFromRevision } from "./designs";
import { creatureStats, type CreatureStats } from "./creature/stats";
import { renderBuilder, renderName } from "./creature/words";
import { summarizeSteps } from "./instructions/steps";
import { getKit, isLabKit } from "./model/templates";
import type { CreatureIdentity, DesignModel, PlacedPart } from "./model/types";
import { liveReadiness } from "./orders/live";
import { getSettings } from "./settings";
import { AppError } from "./util";
import type { ValidationResult } from "./validation/validate";

/* ------------------------------------------------------------------- codes */

/** 31 characters with no look-alikes (no 0/O, 1/I/L). 8 characters give about 39.6 bits. */
export const WISH_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const WISH_CODE_LENGTH = 8;
export const WISH_TTL_DAYS = 30;
const CODE_RE = new RegExp(`^[${WISH_ALPHABET}]{${WISH_CODE_LENGTH}}$`);

export function newWishCode(): string {
  let s = "";
  for (let i = 0; i < WISH_CODE_LENGTH; i++) s += WISH_ALPHABET[crypto.randomInt(WISH_ALPHABET.length)];
  return s;
}

/** Display form: FZ7K-2Q9M. */
export function formatWishCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Accept what a grown-up types or scans: any case, with or without the dash or spaces. Returns the stored form or null. */
export function normalizeWishCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 40) return null;
  const c = input.toUpperCase().replace(/[\s\-‐-―]/g, "");
  return CODE_RE.test(c) ? c : null;
}

/* ------------------------------------------------------------------- notes */

export const WISH_NOTES = ["invented", "together", "special_day"] as const;
export type WishNote = (typeof WISH_NOTES)[number];

export function isWishNote(v: unknown): v is WishNote {
  return typeof v === "string" && (WISH_NOTES as readonly string[]).includes(v);
}

/* ------------------------------------------------------------- kid stages */

/** Kid-facing stages, in the only order they move: forward, or back to "waiting" if an order is canceled. */
export const KID_STAGES = ["waiting", "seen", "ordered", "gathering", "packing", "on_the_way", "arrived"] as const;
export type KidStage = (typeof KID_STAGES)[number];
export interface KidStatus {
  stage: KidStage;
  /** Something is held up (an order exception). Shown only as "Taking a little longer". */
  slow: boolean;
}

/**
 * Pure mapping from the adult's order status to the calm kid stage. Problems never
 * show as problems: an exception keeps the stage it was held from, plus `slow`.
 */
export function kidStage(orderStatus: string | null | undefined, heldFrom: string | null = null, seen = false): KidStatus {
  switch (orderStatus) {
    case null:
    case undefined:
      return { stage: seen ? "seen" : "waiting", slow: false };
    case "draft":
    case "validating":
    case "quoting":
    case "awaiting_acceptance":
      return { stage: "ordered", slow: false };
    case "payment_authorized":
    case "procuring":
      return { stage: "gathering", slow: false };
    case "purchased":
      return { stage: "packing", slow: false };
    case "shipped":
      return { stage: "on_the_way", slow: false };
    case "delivered":
      return { stage: "arrived", slow: false };
    case "exception": {
      const held = heldFrom && heldFrom !== "exception" ? kidStage(heldFrom).stage : "ordered";
      // A held order is still at least "ordered" for the kid.
      return { stage: held === "waiting" || held === "seen" ? "ordered" : held, slow: true };
    }
    case "canceled":
    case "refunded":
      return { stage: "waiting", slow: false };
    default:
      return { stage: "ordered", slow: false };
  }
}

/** Build time shown to grown-ups: about 4 minutes per step, rounded to 5. */
export function buildMinutes(steps: number): number {
  return Math.max(5, Math.round((steps * 4) / 5) * 5);
}

/* ---------------------------------------------------------------- storage */

interface WishRow {
  code: string;
  design_id: string;
  design_revision_id: string;
  note: WishNote;
  status: "waiting" | "seen" | "ordered";
  claimed_design_id: string | null;
  order_id: string | null;
  created_at: string;
  expires_at: string | Date;
}

const CLOSED_ORDER = ["canceled", "refunded"];

interface OrderLink {
  status: string;
  held_from_status: string | null;
  customer_id: string;
  design_id: string;
}

async function orderOf(q: Queryable, orderId: string | null): Promise<OrderLink | null> {
  if (!orderId) return null;
  const { rows } = await q.query<OrderLink>(`SELECT status, held_from_status, customer_id, design_id FROM orders WHERE id = $1`, [orderId]);
  return rows[0] ?? null;
}

function hasActiveOrder(order: { status: string } | null): boolean {
  return !!order && !CLOSED_ORDER.includes(order.status);
}

/** Active = not expired, or ordered (an ordered wish never expires while its order is open). */
function isActive(w: WishRow, order: { status: string } | null, now = Date.now()): boolean {
  return new Date(w.expires_at).getTime() > now || hasActiveOrder(order);
}

const inactive = () => new AppError("wish_inactive", "This wish code isn't active", 404);

function statusOf(w: WishRow, order: { status: string; held_from_status: string | null } | null): KidStatus {
  if (!order) return kidStage(null, null, w.status !== "waiting");
  return kidStage(order.status, order.held_from_status, w.status !== "waiting");
}

/* -------------------------------------------------------------- kid side */

/** What the kid's wish card needs: no price, no validation, nothing about the grown-up. */
export interface KidWish {
  code: string;
  note: WishNote;
  name: string;
  builder: string;
  parts: PlacedPart[];
  colors: Record<string, string>;
  status: KidStatus;
}

/**
 * Freeze the design's current revision into a wish (owner only, lab kits only).
 * Asking again for the same revision returns the existing active wish with the
 * new note, so the kid can change the sticker without getting a new code.
 */
export async function createWish(customerId: string, designId: string, note: unknown): Promise<KidWish> {
  if (!isWishNote(note)) throw new AppError("invalid_note", "Pick one of the stickers");
  return upsertWish(customerId, designId, note);
}

/**
 * Open the wish card: the active wish for the design's current revision with the
 * sticker the kid already picked, or a new wish with the default sticker.
 */
export async function openWish(customerId: string, designId: string): Promise<KidWish> {
  return upsertWish(customerId, designId, null);
}

async function upsertWish(customerId: string, designId: string, note: WishNote | null): Promise<KidWish> {
  const db = await getDb();
  return db.tx(async (q) => {
    const d = (
      await q.query<{ id: string; template: string; current_revision_id: string }>(
        `SELECT id, template, current_revision_id FROM designs WHERE id = $1 AND customer_id = $2 FOR UPDATE`,
        [designId, customerId],
      )
    ).rows[0];
    if (!d || !isLabKit(d.template)) throw new AppError("not_found", "Design not found", 404);
    const rev = (await q.query<{ model: DesignModel }>(`SELECT model FROM design_revisions WHERE id = $1`, [d.current_revision_id])).rows[0];
    const latest = (
      await q.query<WishRow>(`SELECT * FROM wishes WHERE design_id = $1 AND design_revision_id = $2 ORDER BY created_at DESC LIMIT 1`, [designId, d.current_revision_id])
    ).rows[0];
    let w: WishRow | undefined;
    let order: Awaited<ReturnType<typeof orderOf>> = null;
    if (latest) {
      order = await orderOf(q, latest.order_id);
      if (isActive(latest, order)) {
        w = latest;
        // Once the bricks are ordered, the sticker stays the one the grown-up saw.
        if (note && w.note !== note && !hasActiveOrder(order)) {
          await q.query(`UPDATE wishes SET note = $2 WHERE code = $1`, [w.code, note]);
          w = { ...w, note };
        }
      } else order = null;
    }
    if (!w) {
      const first: WishNote = note ?? "invented";
      for (let attempt = 0; attempt < 5 && !w; attempt++) {
        const { rows } = await q.query<WishRow>(
          `INSERT INTO wishes(code, design_id, design_revision_id, note, expires_at) VALUES ($1,$2,$3,$4, now() + ($5 || ' days')::interval)
           ON CONFLICT (code) DO NOTHING RETURNING *`,
          [newWishCode(), designId, d.current_revision_id, first, String(WISH_TTL_DAYS)],
        );
        w = rows[0];
      }
      if (!w) throw new AppError("wish_failed", "Could not make a wish code. Please try again.", 503);
      await audit(q, `customer:${customerId}`, "wish.create", "design", designId, { revisionId: d.current_revision_id, note: first });
    }
    const model = rev.model;
    return {
      code: formatWishCode(w.code),
      note: w.note,
      name: renderName(model.params.identity),
      builder: renderBuilder(model.params.identity),
      parts: model.parts,
      colors: model.params.colors,
      status: statusOf(w, order),
    };
  });
}

/** Kid status: only {stage, slow}, and only for the cookie that owns the wish's source design. */
export async function kidStatus(customerId: string, rawCode: string): Promise<KidStatus> {
  const code = normalizeWishCode(rawCode);
  if (!code) throw new AppError("not_found", "Not found", 404);
  const db = await getDb();
  const w = (await db.query<WishRow & { owner: string }>(`SELECT w.*, d.customer_id AS owner FROM wishes w JOIN designs d ON d.id = w.design_id WHERE w.code = $1`, [code]))
    .rows[0];
  if (!w || w.owner !== customerId) throw new AppError("not_found", "Not found", 404);
  return statusOf(w, await orderOf(db, w.order_id));
}

/* ---------------------------------------------------------- grown-up side */

export interface GrownupWish {
  code: string;
  note: WishNote;
  name: string;
  builder: string;
  identity: CreatureIdentity | null;
  model: Pick<DesignModel, "template" | "templateVersion" | "params" | "parts" | "steps" | "structuralKey">;
  stats: CreatureStats;
  /** Everything in the parcel (bricks plus accessories such as tires). */
  pieces: number;
  /** Placed bricks only (what the creature card counts). */
  bricks: number;
  /** What the extra pieces are, e.g. "tires". */
  extrasLabel: string;
  steps: { index: number; title: string; pieceCount: number }[];
  buildMinutes: number;
  ageBand: string;
  validation: { digitalCheckPassed: boolean; physicallyValidated: boolean };
  /** Someone already ordered these bricks (the order is open). */
  ordered: boolean;
  priceCents: number;
  simulated: boolean;
}

/** Read-only check used before the age screen: no status change, no data returned. */
export async function wishIsActive(rawCode: string): Promise<boolean> {
  const code = normalizeWishCode(rawCode);
  if (!code) return false;
  const db = await getDb();
  const w = (await db.query<WishRow>(`SELECT * FROM wishes WHERE code = $1`, [code])).rows[0];
  return !!w && isActive(w, await orderOf(db, w.order_id));
}

/** The grown-up page data. Marks the wish 'seen' ("A grown-up is looking"). */
export async function getWishForGrownup(rawCode: string): Promise<GrownupWish> {
  const code = normalizeWishCode(rawCode);
  if (!code) throw inactive();
  const db = await getDb();
  const w = (
    await db.query<WishRow & { model: DesignModel; validation: ValidationResult }>(
      `SELECT w.*, r.model, r.validation FROM wishes w JOIN design_revisions r ON r.id = w.design_revision_id WHERE w.code = $1`,
      [code],
    )
  ).rows[0];
  if (!w) throw inactive();
  const order = await orderOf(db, w.order_id);
  if (!isActive(w, order)) throw inactive();
  if (w.status === "waiting") await db.query(`UPDATE wishes SET status = 'seen' WHERE code = $1 AND status = 'waiting'`, [code]);
  const m = w.model;
  const steps = summarizeSteps(m).map((s) => ({ index: s.index, title: s.title, pieceCount: s.pieceCount }));
  const accessories = new Set(m.parts.flatMap((p) => (getPart(p.partId).accessories ?? []).map((a) => a.partId)));
  const [settings, readiness] = await Promise.all([getSettings(), liveReadiness()]);
  return {
    code: formatWishCode(code),
    note: w.note,
    name: renderName(m.params.identity),
    builder: renderBuilder(m.params.identity),
    identity: m.params.identity ?? null,
    model: { template: m.template, templateVersion: m.templateVersion, params: m.params, parts: m.parts, steps: m.steps, structuralKey: m.structuralKey },
    stats: creatureStats(m),
    pieces: steps.reduce((n, s) => n + s.pieceCount, 0),
    bricks: m.parts.length,
    extrasLabel: [...accessories].every((id) => id.startsWith("tire-")) ? "tires" : "small extras",
    steps,
    buildMinutes: buildMinutes(m.steps.length),
    ageBand: getKit(m.template).ageBand,
    validation: { digitalCheckPassed: w.validation.status === "valid", physicallyValidated: !!w.validation.physicallyValidated },
    ordered: hasActiveOrder(order),
    priceCents: settings.creaturePriceCents,
    simulated: !readiness.ready,
  };
}

/**
 * "Order these bricks": copy the frozen revision into a new design owned by the
 * grown-up (identical params and structuralKey; the kid's design is untouched).
 * Idempotent per grown-up: claiming again (any number of times, from any tab)
 * returns the same copy. Grown-ups on other devices get their own copies; the
 * first to place an order wins, and after that nobody else can claim. Returns
 * the open order if this grown-up already placed one.
 */
export async function claimWish(adultCustomerId: string, rawCode: string): Promise<{ designId: string; orderId: string | null }> {
  const code = normalizeWishCode(rawCode);
  if (!code) throw inactive();
  const db = await getDb();
  return db.tx(async (q) => {
    const w = (await q.query<WishRow>(`SELECT * FROM wishes WHERE code = $1 FOR UPDATE`, [code])).rows[0];
    if (!w) throw inactive();
    const order = await orderOf(q, w.order_id);
    if (!isActive(w, order)) throw inactive();
    if (hasActiveOrder(order)) {
      if (order!.customer_id === adultCustomerId) return { designId: order!.design_id, orderId: w.order_id };
      throw new AppError("already_ordered", "A grown-up already ordered these bricks.", 409);
    }
    const mine = (
      await q.query<{ design_id: string }>(
        `SELECT c.design_id FROM wish_claims c JOIN designs d ON d.id = c.design_id WHERE c.code = $1 AND d.customer_id = $2 ORDER BY c.created_at DESC LIMIT 1`,
        [code, adultCustomerId],
      )
    ).rows[0];
    if (mine) {
      await q.query(`UPDATE wishes SET claimed_design_id = $2 WHERE code = $1`, [code, mine.design_id]);
      return { designId: mine.design_id, orderId: null };
    }
    const designId = await createDesignFromRevision(adultCustomerId, w.design_revision_id, "wish", { note: `From wish ${formatWishCode(code)}`, q });
    const copy = (await q.query<{ current_revision_id: string }>(`SELECT current_revision_id FROM designs WHERE id = $1`, [designId])).rows[0];
    await q.query(`INSERT INTO wish_claims(design_id, code, revision_id) VALUES ($1,$2,$3)`, [designId, code, copy.current_revision_id]);
    await q.query(`UPDATE wishes SET claimed_design_id = $2, status = CASE WHEN status = 'waiting' THEN 'seen' ELSE status END WHERE code = $1`, [code, designId]);
    await audit(q, `customer:${adultCustomerId}`, "wish.claim", "design", designId, {});
    return { designId, orderId: null };
  });
}

/** The wish claim a grown-up's design came from, or null if it was not created by a claim. */
async function claimOf(q: Queryable, designId: string): Promise<{ code: string; revision_id: string; order_id: string | null; expires_at: string | Date } | null> {
  const { rows } = await q.query<{ code: string; revision_id: string; order_id: string | null; expires_at: string | Date }>(
    `SELECT c.code, c.revision_id, w.order_id, w.expires_at FROM wish_claims c JOIN wishes w ON w.code = c.code WHERE c.design_id = $1`,
    [designId],
  );
  return rows[0] ?? null;
}

/** Checkout guard: the wish (if any) that a grown-up's claimed design came from. */
export async function wishForClaimedDesign(
  designId: string,
  q?: Queryable,
): Promise<{ code: string; orderId: string | null; orderStatus: string | null; orderCustomerId: string | null } | null> {
  const db = q ?? (await getDb());
  const c = await claimOf(db, designId);
  if (!c) return null;
  const order = await orderOf(db, c.order_id);
  return { code: c.code, orderId: c.order_id, orderStatus: order?.status ?? null, orderCustomerId: order?.customer_id ?? null };
}

/**
 * Inside createOrder's transaction: lock the wish behind a claimed creature and
 * return what to freeze. Throws not_found when the design was not created by a
 * wish claim (so a kid's Lab design never reaches an order), and refuses when the
 * code has expired or the bricks are already ordered. The frozen copy is ordered
 * even if the grown-up's copy was edited later.
 */
export async function lockClaimForOrder(q: Queryable, designId: string): Promise<{ code: string; revisionId: string }> {
  const c = await claimOf(q, designId);
  if (!c) throw new AppError("not_found", "Design not found", 404);
  const w = (await q.query<WishRow>(`SELECT * FROM wishes WHERE code = $1 FOR UPDATE`, [c.code])).rows[0];
  const order = await orderOf(q, w.order_id);
  if (hasActiveOrder(order)) throw new AppError("already_ordered", "These bricks are already ordered. See My orders.", 409);
  if (!isActive(w, order)) throw new AppError("wish_inactive", "This wish code isn't active any more. Ask your young inventor to tap “Show a grown-up” again for a fresh code.", 409);
  return { code: c.code, revisionId: c.revision_id };
}

/** Called by createOrder in the same transaction: the kid now sees "Ordered!". */
export async function markWishOrdered(q: Queryable, code: string, orderId: string, designId: string) {
  await q.query(`UPDATE wishes SET status = 'ordered', order_id = $2, claimed_design_id = $3 WHERE code = $1`, [code, orderId, designId]);
}

/** What the grown-up's checkout shows for a claimed creature: the frozen copy, never later edits. */
export interface ClaimedCreature {
  code: string;
  name: string;
  builder: string;
  model: DesignModel;
  digitalCheckPassed: boolean;
  pieces: number;
  steps: number;
  buildMinutes: number;
  ageBand: string;
  /** Not expired, or ordered. */
  active: boolean;
  openOrder: { id: string; mine: boolean } | null;
}

export async function claimedCreature(customerId: string, designId: string): Promise<ClaimedCreature | null> {
  const db = await getDb();
  const c = (
    await db.query<{ code: string; model: DesignModel; validation: ValidationResult; order_id: string | null; expires_at: string | Date }>(
      `SELECT c.code, r.model, r.validation, w.order_id, w.expires_at FROM wish_claims c
       JOIN designs d ON d.id = c.design_id JOIN design_revisions r ON r.id = c.revision_id JOIN wishes w ON w.code = c.code
       WHERE c.design_id = $1 AND d.customer_id = $2`,
      [designId, customerId],
    )
  ).rows[0];
  if (!c) return null;
  const order = await orderOf(db, c.order_id);
  const m = c.model;
  return {
    code: formatWishCode(c.code),
    name: renderName(m.params.identity),
    builder: renderBuilder(m.params.identity),
    model: m,
    digitalCheckPassed: c.validation.status === "valid",
    pieces: summarizeSteps(m).reduce((n, s) => n + s.pieceCount, 0),
    steps: m.steps.length,
    buildMinutes: buildMinutes(m.steps.length),
    ageBand: getKit(m.template).ageBand,
    active: new Date(c.expires_at).getTime() > Date.now() || hasActiveOrder(order),
    openOrder: hasActiveOrder(order) ? { id: c.order_id!, mine: order!.customer_id === customerId } : null,
  };
}
