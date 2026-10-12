import { beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getDb } from "@/lib/db";
import { applyEdits, createDesign, getDesignView } from "@/lib/designs";
import { assertRateLimit, resetRateLimits, takeToken } from "@/lib/http";
import { createOrder } from "@/lib/orders/service";
import { DEFAULT_SETTINGS, getSettings, updateSettings } from "@/lib/settings";
import { AppError } from "@/lib/util";
import {
  claimWish,
  createWish,
  formatWishCode,
  getWishForGrownup,
  KID_STAGES,
  kidStage,
  kidStatus,
  buildMinutes,
  newWishCode,
  normalizeWishCode,
  WISH_ALPHABET,
  wishForClaimedDesign,
  wishIsActive,
} from "@/lib/wishes";
import { birthYearOptions, isAdultBirthYear } from "@/components/wish/age";
import AgeGate from "@/components/wish/AgeGate";
import { CONTACT, freshDb } from "./helpers";

const cust = () => crypto.randomUUID();

/** A kid with a creature and a wish for it. */
async function kidWithWish(note: "invented" | "together" | "special_day" = "invented") {
  const kid = cust();
  const designId = await createDesign(kid, "creature");
  await applyEdits(kid, designId, [{ name: "set_identity", input: { name: [0, 0, 0], builder: [0, 0, 32] } }], "visual");
  const wish = await createWish(kid, designId, note);
  return { kid, designId, wish, code: wish.code };
}

async function tableCounts() {
  const db = await getDb();
  const tables = ["customers", "designs", "design_revisions", "wishes", "orders", "audit_events"];
  const out: Record<string, number> = {};
  for (const t of tables) out[t] = Number((await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${t}`)).rows[0].n);
  return out;
}

describe("wish codes", () => {
  it("uses 8 characters from a 31-character unambiguous alphabet", () => {
    expect(WISH_ALPHABET).toHaveLength(31);
    expect(new Set(WISH_ALPHABET).size).toBe(31);
    for (const ch of "0O1IL") expect(WISH_ALPHABET).not.toContain(ch);
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const c = newWishCode();
      expect(c).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
      seen.add(c);
    }
    expect(seen.size).toBe(2000);
    // About 40 bits of entropy.
    expect(8 * Math.log2(31)).toBeGreaterThan(39.5);
  });

  it("formats as XXXX-XXXX and accepts typed codes with or without the dash, in any case", () => {
    expect(formatWishCode("FZ7K2Q9M")).toBe("FZ7K-2Q9M");
    expect(normalizeWishCode("FZ7K-2Q9M")).toBe("FZ7K2Q9M");
    expect(normalizeWishCode("fz7k2q9m")).toBe("FZ7K2Q9M");
    expect(normalizeWishCode(" fz7k 2q9m ")).toBe("FZ7K2Q9M");
    expect(normalizeWishCode("FZ7K–2Q9M")).toBe("FZ7K2Q9M"); // en dash from autocorrect
    for (const bad of ["", "FZ7K-2Q9", "FZ7K-2Q9MM", "FZ7K-2Q90", "OZ7K2Q9M", "FZ7K2Q9I", "FZ7K2Q9L", "FZ7K/2Q9M", null, 42, "x".repeat(100)]) {
      expect(normalizeWishCode(bad)).toBeNull();
    }
  });
});

describe("kid stage mapping", () => {
  it("maps every order status to a calm kid stage", () => {
    expect(kidStage(null)).toEqual({ stage: "waiting", slow: false });
    expect(kidStage(null, null, true)).toEqual({ stage: "seen", slow: false });
    for (const s of ["draft", "validating", "quoting", "awaiting_acceptance"]) expect(kidStage(s)).toEqual({ stage: "ordered", slow: false });
    for (const s of ["payment_authorized", "procuring"]) expect(kidStage(s)).toEqual({ stage: "gathering", slow: false });
    expect(kidStage("purchased")).toEqual({ stage: "packing", slow: false });
    expect(kidStage("shipped")).toEqual({ stage: "on_the_way", slow: false });
    expect(kidStage("delivered")).toEqual({ stage: "arrived", slow: false });
    for (const s of ["canceled", "refunded"]) expect(kidStage(s, null, true)).toEqual({ stage: "waiting", slow: false });
  });

  it("an exception keeps the stage it was held from and only adds 'slow'", () => {
    expect(kidStage("exception", "quoting")).toEqual({ stage: "ordered", slow: true });
    expect(kidStage("exception", "procuring")).toEqual({ stage: "gathering", slow: true });
    expect(kidStage("exception", "purchased")).toEqual({ stage: "packing", slow: true });
    expect(kidStage("exception", "shipped")).toEqual({ stage: "on_the_way", slow: true });
    expect(kidStage("exception", null)).toEqual({ stage: "ordered", slow: true });
  });

  it("follows the happy path strictly forward", () => {
    const path = ["draft", "validating", "quoting", "awaiting_acceptance", "payment_authorized", "procuring", "purchased", "shipped", "delivered"];
    const idx = path.map((s) => KID_STAGES.indexOf(kidStage(s).stage));
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThanOrEqual(idx[i - 1]);
    expect(KID_STAGES[idx.at(-1)!]).toBe("arrived");
  });

  it("estimates build time as steps x 4 minutes, rounded to 5", () => {
    expect(buildMinutes(7)).toBe(30);
    expect(buildMinutes(8)).toBe(30);
    expect(buildMinutes(10)).toBe(40);
    expect(buildMinutes(1)).toBe(5);
  });
});

describe("neutral age screen", () => {
  const now = new Date("2026-10-12T12:00:00Z");

  it("treats a birth year as adult only when it makes the person 18 or older this year", () => {
    expect(isAdultBirthYear(2008, now)).toBe(true);
    expect(isAdultBirthYear("1980", now)).toBe(true);
    expect(isAdultBirthYear(2009, now)).toBe(false);
    expect(isAdultBirthYear(2019, now)).toBe(false);
    for (const bad of ["", " ", undefined, null, "abc", 2008.5, 2030, 1800]) expect(isAdultBirthYear(bad, now)).toBe(false);
    expect(birthYearOptions(now)[0]).toBe(2026);
  });

  it("starts empty with no default year and the Continue button disabled", () => {
    const html = renderToStaticMarkup(createElement(AgeGate, { onAdult: () => undefined }));
    expect(html).toContain("What year were you born?");
    expect(html).toMatch(/<option value="" disabled="" selected="">Choose a year<\/option>/);
    expect(html.match(/selected=""/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Continue<\/button>/);
    expect(html).not.toMatch(/type="text"|<textarea|\$|price/i);
  });

  it("never sends, stores or sets anything", async () => {
    // Static guard on the component: no network, cookies or storage of any kind.
    const src = fs.readFileSync("src/components/wish/AgeGate.tsx", "utf8") + fs.readFileSync("src/components/wish/age.ts", "utf8");
    for (const banned of ["fetch(", "document.cookie", "localStorage", "sessionStorage", "indexedDB", "XMLHttpRequest", "sendBeacon", "/api/"]) expect(src).not.toContain(banned);
    // And deciding writes nothing to the database.
    await freshDb();
    const before = await tableCounts();
    isAdultBirthYear(1990);
    isAdultBirthYear(2015);
    expect(await tableCounts()).toEqual(before);
  });
});

describe("rate limiting", () => {
  beforeEach(() => resetRateLimits());

  it("allows 30 lookups per minute per IP, then refuses until the bucket refills", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 30; i++) expect(takeToken("lookup:1.2.3.4", 30, 60_000, t0)).toBe(true);
    expect(takeToken("lookup:1.2.3.4", 30, 60_000, t0)).toBe(false);
    expect(takeToken("lookup:5.6.7.8", 30, 60_000, t0)).toBe(true); // other IPs are unaffected
    expect(takeToken("lookup:1.2.3.4", 30, 60_000, t0 + 2_000)).toBe(true); // 1 token per 2 s
    expect(takeToken("lookup:1.2.3.4", 30, 60_000, t0 + 2_000)).toBe(false);
  });

  it("throws HTTP 429 per client IP", () => {
    const h = new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" });
    for (let i = 0; i < 30; i++) assertRateLimit(h, "wish-lookup", 30);
    try {
      assertRateLimit(h, "wish-lookup", 30);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).status).toBe(429);
    }
    assertRateLimit(new Headers({ "x-forwarded-for": "8.8.8.8" }), "wish-lookup", 30);
  });

  it("GET /api/wishes/[code] answers 429 after 30 lookups from one IP", async () => {
    await freshDb();
    const { code } = await kidWithWish();
    const { GET } = await import("@/app/api/wishes/[code]/route");
    const call = () => GET(new Request(`http://localhost/api/wishes/${code}`, { headers: { "x-forwarded-for": "7.7.7.7" } }), { params: Promise.resolve({ code }) });
    const first = await call();
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.name).toBeTruthy();
    for (let i = 1; i < 30; i++) await call();
    expect((await call()).status).toBe(429);
    const unknown = await GET(new Request("http://localhost/api/wishes/AAAA2222", { headers: { "x-forwarded-for": "6.6.6.6" } }), {
      params: Promise.resolve({ code: "AAAA2222" }),
    });
    expect(unknown.status).toBe(404);
  });
});

describe("wishes", () => {
  beforeEach(async () => {
    await freshDb();
    resetRateLimits();
  });

  it("creates a wish for the owner's creature with only a note id, and reuses it for the same revision", async () => {
    const { kid, designId, wish } = await kidWithWish();
    expect(wish.code).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/);
    expect(wish.note).toBe("invented");
    expect(wish.status).toEqual({ stage: "waiting", slow: false });
    expect(wish.name).toBe("Captain Fizzfang");
    expect(wish.builder).toBe("BraveOtter42");
    // The kid payload carries no money, validation or ids.
    expect(Object.keys(wish).sort()).toEqual(["builder", "code", "colors", "name", "note", "parts", "status"]);
    const again = await createWish(kid, designId, "together");
    expect(again.code).toBe(wish.code);
    expect(again.note).toBe("together");
    const db = await getDb();
    const rows = (await db.query<{ code: string; note: string; expires_at: string; created_at: string }>(`SELECT * FROM wishes`)).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBe("together");
    const days = (new Date(rows[0].expires_at).getTime() - new Date(rows[0].created_at).getTime()) / 86_400_000;
    expect(days).toBeCloseTo(30, 3);
  });

  it("only the owner can make a wish, only for lab kits, and only with a preset note", async () => {
    const kid = cust();
    const designId = await createDesign(kid, "creature");
    await expect(createWish(cust(), designId, "invented")).rejects.toThrow(/not found/i);
    await expect(createWish(kid, designId, "Please buy this for Emma at 12 Elm St")).rejects.toThrow(/sticker/);
    await expect(createWish(kid, designId, undefined)).rejects.toThrow(/sticker/);
    const cottage = await createDesign(kid, "cottage");
    await expect(createWish(kid, cottage, "invented")).rejects.toThrow(/not found/i);
    const db = await getDb();
    expect((await db.query(`SELECT * FROM wishes`)).rows).toHaveLength(0);
  });

  it("shows the grown-up the frozen creature even after the kid keeps editing", async () => {
    const { kid, designId, code } = await kidWithWish();
    const frozen = await getDesignView(kid, designId);
    await applyEdits(kid, designId, [{ name: "set_option", input: { option: "back", value: frozen.params.options.back === "wings" ? "shell" : "wings" } }], "visual");
    await applyEdits(kid, designId, [{ name: "set_identity", input: { name: [1, 1, 1], builder: [1, 1, 1] } }], "visual");
    const g = await getWishForGrownup(code.toLowerCase().replace("-", ""));
    expect(g.code).toBe(code);
    expect(g.model.structuralKey).toBe(frozen.model.structuralKey);
    expect(g.model.params).toEqual(frozen.params);
    expect(g.name).toBe("Captain Fizzfang");
    expect(g.builder).toBe("BraveOtter42");
    expect(g.stats).toEqual(frozen.stats);
    expect(g.pieces).toBe(frozen.bom.totalPieces);
    expect(g.steps.map((s) => s.title).at(-1)).toBe("Power up!");
    expect(g.buildMinutes).toBe(buildMinutes(frozen.model.steps.length));
    expect(g.ageBand).toBe("6+");
    expect(g.validation).toEqual({ digitalCheckPassed: true, physicallyValidated: false });
    expect(g.priceCents).toBe(2400);
    expect(g.simulated).toBe(true);
    expect(g.ordered).toBe(false);
    // Nothing that points back at the kid's design or device.
    const json = JSON.stringify(g);
    expect(json).not.toContain(designId);
    expect(json).not.toContain(kid);
  });

  it("marks the wish seen for the kid when a grown-up looks (and the pre-check writes nothing)", async () => {
    const { kid, code } = await kidWithWish();
    expect(await kidStatus(kid, code)).toEqual({ stage: "waiting", slow: false });
    const before = await tableCounts();
    expect(await wishIsActive(code)).toBe(true);
    expect(await kidStatus(kid, code)).toEqual({ stage: "waiting", slow: false });
    expect(await tableCounts()).toEqual(before);
    await getWishForGrownup(code);
    expect(await kidStatus(kid, code)).toEqual({ stage: "seen", slow: false });
  });

  it("returns the kid status only to the cookie that owns the source design", async () => {
    const { kid, code } = await kidWithWish();
    await expect(kidStatus(cust(), code)).rejects.toThrow(/not found/i);
    const adult = cust();
    await claimWish(adult, code);
    await expect(kidStatus(adult, code)).rejects.toThrow(/not found/i);
    await expect(kidStatus(kid, "AAAA-2222")).rejects.toThrow(/not found/i);
    await expect(kidStatus(kid, "not a code")).rejects.toThrow(/not found/i);
    expect(Object.keys(await kidStatus(kid, code)).sort()).toEqual(["slow", "stage"]);
  });

  it("claim copies the frozen creature to the grown-up and leaves the kid's design untouched", async () => {
    const { kid, designId, code } = await kidWithWish();
    const db = await getDb();
    const kidBefore = (await db.query(`SELECT * FROM designs WHERE id = $1`, [designId])).rows[0];
    const kidRevs = (await db.query(`SELECT id FROM design_revisions WHERE design_id = $1 ORDER BY rev`, [designId])).rows;
    const kidView = await getDesignView(kid, designId);
    const adult = cust();
    const { designId: copyId, orderId } = await claimWish(adult, code);
    expect(orderId).toBeNull();
    expect(copyId).not.toBe(designId);
    const copy = await getDesignView(adult, copyId);
    expect(copy.params).toEqual(kidView.params);
    expect(copy.model.structuralKey).toBe(kidView.model.structuralKey);
    expect(copy.model.parts).toEqual(kidView.model.parts);
    expect(copy.name).toBe("Captain Fizzfang");
    expect(copy.revision.source).toBe("wish");
    expect(copy.revision.canUndo).toBe(false);
    // The kid's design and its history are unchanged, and neither side can see the other's design.
    expect((await db.query(`SELECT * FROM designs WHERE id = $1`, [designId])).rows[0]).toEqual(kidBefore);
    expect((await db.query(`SELECT id FROM design_revisions WHERE design_id = $1 ORDER BY rev`, [designId])).rows).toEqual(kidRevs);
    await expect(getDesignView(adult, designId)).rejects.toThrow(/not found/i);
    await expect(getDesignView(kid, copyId)).rejects.toThrow(/not found/i);
    // Idempotent per grown-up.
    expect((await claimWish(adult, code)).designId).toBe(copyId);
    expect((await db.query(`SELECT * FROM designs`)).rows).toHaveLength(2);
    expect(await wishForClaimedDesign(copyId)).toMatchObject({ code: code.replace("-", ""), orderId: null });
  });

  it("a later grown-up on another device takes over the claim until the bricks are ordered", async () => {
    const { code } = await kidWithWish();
    const phone = cust();
    const laptop = cust();
    const a = await claimWish(phone, code);
    const b = await claimWish(laptop, code);
    expect(b.designId).not.toBe(a.designId);
    await expect(createOrder(phone, { designId: a.designId, contact: CONTACT, adultConfirmed: true })).rejects.toThrow(/not found/i);
    const orderId = await createOrder(laptop, { designId: b.designId, contact: CONTACT, adultConfirmed: true });
    // Once ordered, nobody else can claim it, and the same grown-up is sent to their order.
    await expect(claimWish(phone, code)).rejects.toThrow(/already ordered/);
    expect(await claimWish(laptop, code)).toEqual({ designId: b.designId, orderId });
    await expect(createOrder(laptop, { designId: b.designId, contact: CONTACT, adultConfirmed: true })).rejects.toThrow(/already ordered/);
    expect((await getWishForGrownup(code)).ordered).toBe(true);
  });

  it("a kid's Lab design (or any unclaimed creature) can never be ordered directly", async () => {
    const { kid, designId } = await kidWithWish();
    await expect(createOrder(kid, { designId, contact: CONTACT, adultConfirmed: true })).rejects.toThrow(/not found/i);
    const adult = cust();
    const own = await createDesign(adult, "creature");
    await expect(createOrder(adult, { designId: own, contact: CONTACT, adultConfirmed: true })).rejects.toThrow(/not found/i);
    const db = await getDb();
    expect((await db.query(`SELECT * FROM orders`)).rows).toHaveLength(0);
  });

  it("ordering freezes the fixed price and the wish, and moves the kid to 'Ordered!'", async () => {
    const { kid, code } = await kidWithWish();
    const adult = cust();
    const { designId } = await claimWish(adult, code);
    const orderId = await createOrder(adult, { designId, contact: CONTACT, adultConfirmed: true, budgetCents: 100 });
    const db = await getDb();
    const o = (await db.query<{ fixed_price_cents: number; wish_code: string; budget_cents: number | null }>(`SELECT * FROM orders WHERE id = $1`, [orderId])).rows[0];
    expect(o).toMatchObject({ fixed_price_cents: 2400, wish_code: code.replace("-", ""), budget_cents: null });
    const w = (await db.query<{ status: string; order_id: string }>(`SELECT * FROM wishes`)).rows[0];
    expect(w).toMatchObject({ status: "ordered", order_id: orderId });
    expect(await kidStatus(kid, code)).toEqual({ stage: "ordered", slow: false });
  });

  it("expires unordered wishes after 30 days", async () => {
    const { kid, designId, code } = await kidWithWish();
    const db = await getDb();
    await db.query(`UPDATE wishes SET expires_at = now() - interval '1 minute'`);
    expect(await wishIsActive(code)).toBe(false);
    await expect(getWishForGrownup(code)).rejects.toThrow(/isn't active/);
    await expect(claimWish(cust(), code)).rejects.toThrow(/isn't active/);
    expect((await db.query<{ status: string }>(`SELECT status FROM wishes`)).rows[0].status).toBe("waiting");
    // Showing a grown-up again makes a fresh code for the same creature.
    const fresh = await createWish(kid, designId, "invented");
    expect(fresh.code).not.toBe(code);
    expect(await wishIsActive(fresh.code)).toBe(true);
  });

  it("an ordered wish stays valid after 30 days", async () => {
    const { code } = await kidWithWish();
    const adult = cust();
    const { designId } = await claimWish(adult, code);
    await createOrder(adult, { designId, contact: CONTACT, adultConfirmed: true });
    const db = await getDb();
    await db.query(`UPDATE wishes SET expires_at = now() - interval '1 day'`);
    expect(await wishIsActive(code)).toBe(true);
    expect((await getWishForGrownup(code)).ordered).toBe(true);
  });
});

describe("fixed creature price setting", () => {
  beforeEach(async () => {
    await freshDb();
  });

  it("defaults to $24.00 and is validated when the owner changes it", async () => {
    expect(DEFAULT_SETTINGS.creaturePriceCents).toBe(2400);
    expect((await getSettings()).creaturePriceCents).toBe(2400);
    for (const bad of [-100, 0, 99, 12.5, 100001, Number.NaN]) await expect(updateSettings({ creaturePriceCents: bad }, "test")).rejects.toThrow(/creaturePriceCents/);
    expect((await updateSettings({ creaturePriceCents: 2900 }, "test")).creaturePriceCents).toBe(2900);
    expect((await getSettings()).creaturePriceCents).toBe(2900);
  });
});
