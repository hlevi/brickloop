import { getDb, type Queryable } from "./db";
import { audit } from "./audit";
import { AppError } from "./util";
import type { PriceTier } from "./cards/pricing";

export interface OperatingSettings {
  purchasingPaused: boolean;
  /** Maximum supplier landed cost for a single order. */
  maxOrderSupplierCents: number;
  /** Maximum supplier spend (confirmed + uncertain) per UTC day. */
  dailySpendLimitCents: number;
  /** Minimum contribution (service fee minus estimated payment fees) per order. */
  minContributionCents: number;
  serviceFeeFlatCents: number;
  serviceFeePercent: number;
  quoteTtlMinutes: number;
  maxProcurementAttempts: number;
  condition: "N" | "U";
  digestIntervalHours: number;
  deliveryGraceDays: number;
  /** Fraction of the authorization window after which an un-captured auth is escalated. */
  authEscalateAfterHours: number;
  /** Fixed card prices per tier (cards/pricing.ts), including printing, packing, delivery and taxes. */
  cardPrices: Record<PriceTier, number>;
}

export const DEFAULT_SETTINGS: OperatingSettings = {
  purchasingPaused: false,
  maxOrderSupplierCents: 15000,
  dailySpendLimitCents: 50000,
  minContributionCents: 150,
  serviceFeeFlatCents: 150,
  serviceFeePercent: 8,
  quoteTtlMinutes: 30,
  maxProcurementAttempts: 3,
  condition: "N",
  digestIntervalHours: 24,
  deliveryGraceDays: 3,
  authEscalateAfterHours: 120,
  cardPrices: { mini: 1900, classic: 2500, grand: 3400, "mosaic-8": 2200, "mosaic-16": 3600 },
};

export interface SimulatorSettings {
  /** One-shot fault for the next supplier purchase. */
  nextPurchaseFault: null | "timeout_placed" | "timeout_not_placed" | "partial" | "error";
  /** Percentage applied to supplier prices from now on (models price drift). */
  priceDriftPercent: number;
  /** "partId|colorId" keys reported out of stock. */
  outOfStock: string[];
  nextAuthorizationDeclined: boolean;
  nextCaptureFails: boolean;
}

export const DEFAULT_SIMULATOR: SimulatorSettings = {
  nextPurchaseFault: null,
  priceDriftPercent: 0,
  outOfStock: [],
  nextAuthorizationDeclined: false,
  nextCaptureFails: false,
};

async function getKey<T>(q: Queryable, key: string, defaults: T): Promise<T> {
  const { rows } = await q.query<{ value: T }>(`SELECT value FROM settings WHERE key = $1`, [key]);
  return { ...defaults, ...(rows[0]?.value ?? {}) };
}

export async function getSettings(q?: Queryable): Promise<OperatingSettings> {
  const s = await getKey(q ?? (await getDb()), "operating", DEFAULT_SETTINGS);
  return { ...s, cardPrices: { ...DEFAULT_SETTINGS.cardPrices, ...s.cardPrices } };
}

export async function getSimulatorSettings(q?: Queryable): Promise<SimulatorSettings> {
  return getKey(q ?? (await getDb()), "simulator", DEFAULT_SIMULATOR);
}

function validateSettings(s: OperatingSettings) {
  const nonNeg: (keyof OperatingSettings)[] = [
    "maxOrderSupplierCents",
    "dailySpendLimitCents",
    "minContributionCents",
    "serviceFeeFlatCents",
    "serviceFeePercent",
    "quoteTtlMinutes",
    "maxProcurementAttempts",
    "digestIntervalHours",
    "deliveryGraceDays",
    "authEscalateAfterHours",
  ];
  for (const k of nonNeg) {
    const v = s[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new AppError("invalid_setting", `${k} must be a non-negative number`);
  }
  if (s.maxProcurementAttempts < 1 || s.maxProcurementAttempts > 10) throw new AppError("invalid_setting", "maxProcurementAttempts must be 1-10");
  if (s.quoteTtlMinutes < 1) throw new AppError("invalid_setting", "quoteTtlMinutes must be at least 1");
  for (const tier of Object.keys(DEFAULT_SETTINGS.cardPrices) as PriceTier[]) {
    const v = s.cardPrices?.[tier];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 100 || v > 100000) {
      throw new AppError("invalid_setting", `cardPrices.${tier} must be a whole number of cents from 100 to 100000`);
    }
  }
  if (!["N", "U"].includes(s.condition)) throw new AppError("invalid_setting", "condition must be N or U");
  if (typeof s.purchasingPaused !== "boolean") throw new AppError("invalid_setting", "purchasingPaused must be boolean");
}

export async function updateSettings(patch: Partial<OperatingSettings>, actor: string): Promise<OperatingSettings> {
  const db = await getDb();
  return db.tx(async (q) => {
    const current = await getSettings(q);
    const allowed = Object.keys(DEFAULT_SETTINGS);
    const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
    const next = { ...current, ...clean } as OperatingSettings;
    if (clean.cardPrices) next.cardPrices = { ...current.cardPrices, ...(clean.cardPrices as Partial<OperatingSettings["cardPrices"]>) };
    validateSettings(next);
    await q.query(
      `INSERT INTO settings(key, value, updated_by, updated_at) VALUES ('operating', $1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [JSON.stringify(next), actor],
    );
    await audit(q, actor, "settings.update", "settings", "operating", { before: current, after: next });
    return next;
  });
}

export async function updateSimulatorSettings(patch: Partial<SimulatorSettings>, actor: string, q?: Queryable): Promise<SimulatorSettings> {
  const run = async (qq: Queryable) => {
    const current = await getSimulatorSettings(qq);
    const next = { ...current, ...patch };
    await qq.query(
      `INSERT INTO settings(key, value, updated_by, updated_at) VALUES ('simulator', $1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [JSON.stringify(next), actor],
    );
    await audit(qq, actor, "simulator.update", "settings", "simulator", { patch });
    return next;
  };
  if (q) return run(q);
  const db = await getDb();
  return db.tx(run);
}
