import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { PDFArray, PDFDocument, PDFName, PDFRawStream, type PDFRef } from "pdf-lib";
import { newCustomerToken } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { applyEdits, createDesign } from "@/lib/designs";
import { creatureStats } from "@/lib/creature/stats";
import { formatBornOn } from "@/lib/instructions/creaturePages";
import { creaturePackInfo, designInstructionsPdf, orderInstructionsPdf } from "@/lib/instructions/creaturePack";
import { generateInstructionsPdf } from "@/lib/instructions/pdf";
import { base32, creatureSerial } from "@/lib/instructions/serial";
import { computeBom } from "@/lib/bom/bom";
import { buildModel, defaultParams, READY_MADE_KITS } from "@/lib/model/templates";
import { createOrder } from "@/lib/orders/service";
import { validateModel } from "@/lib/validation/validate";
import { claimWish, createWish } from "@/lib/wishes";
import { CONTACT, freshDb } from "./helpers";

// Route tests read the customer cookie through next/headers.
const jar = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.token ? { name, value: jar.token } : undefined), set: () => {} }),
}));

// ---------------------------------------------------------------------------
// PDF text extraction: inflate each page's FlateDecode content streams with
// node:zlib and collect the strings shown by Tj (pdf-lib writes one Tj per
// drawText call, as a hex string in the font's WinAnsi encoding).
// ---------------------------------------------------------------------------

function inflate(s: PDFRawStream): string {
  const filter = s.dict.get(PDFName.of("Filter"));
  const raw = Buffer.from(s.contents);
  return (filter === PDFName.of("FlateDecode") ? zlib.inflateSync(raw) : raw).toString("latin1");
}

function shownText(content: string): string[] {
  const out: string[] = [];
  for (const m of content.matchAll(/<([0-9A-Fa-f]*)>\s*Tj|\(((?:\\.|[^\\)])*)\)\s*Tj/g)) out.push(m[1] !== undefined ? Buffer.from(m[1], "hex").toString("latin1") : m[2]);
  return out;
}

async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => {
    const c = page.node.get(PDFName.of("Contents"));
    const refs = c instanceof PDFArray ? c.asArray() : [c];
    return refs
      .map((r) => doc.context.lookup(r as PDFRef))
      .filter((s): s is PDFRawStream => s instanceof PDFRawStream)
      .flatMap((s) => shownText(inflate(s)))
      .join("\n");
  });
}

/**
 * Everything in the file a reader could see: the decoded document info, every
 * non-stream object, and every string shown by any (inflated) content stream.
 * Drawing operators are left out: their coordinates are just numbers.
 */
async function everything(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(await (await PDFDocument.load(bytes)).save({ useObjectStreams: false }));
  const parts = [doc.getTitle(), doc.getAuthor(), doc.getSubject(), doc.getKeywords(), doc.getCreator(), doc.getProducer()].map((v) => v ?? "");
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) parts.push(obj.dict.toString(), ...shownText(inflate(obj)));
    else parts.push(obj.toString());
  }
  return parts.join("\n");
}

/** Text with line breaks and runs of spaces collapsed (wrapped lines read as one). */
const squash = (s: string) => s.replace(/\s+/g, " ");

const cust = (): string => crypto.randomUUID();
const NAME = "Captain Fizzfang";
const TAG = "BraveOtter42";
const WISH_LINE = "Make a wish, then click Captain Fizzfang's power core into place.";
const CONTACT_FIELDS = [CONTACT.name, CONTACT.email, CONTACT.shipTo.line1, CONTACT.shipTo.city, CONTACT.shipTo.postalCode, "Example", "example.com"];

function expectNoBadClaims(all: string) {
  expect(all.toLowerCase()).not.toContain("1 of 1");
  expect(all.toLowerCase()).not.toContain("only one");
  expect(all).not.toMatch(/[\u{1F300}-\u{1FAFF}☀-➿]/u);
}

/** A kid invents Captain Fizzfang, a grown-up claims the wish and orders it. */
async function creatureOrder(adult: string = cust()) {
  const kid = cust();
  const designId = await createDesign(kid, "creature");
  await applyEdits(kid, designId, [{ name: "set_identity", input: { name: [0, 0, 0], builder: [0, 0, 32] } }], "visual");
  const wish = await createWish(kid, designId, "invented");
  const claimed = await claimWish(adult, wish.code);
  const orderId = await createOrder(adult, { designId: claimed.designId, contact: CONTACT, adultConfirmed: true });
  return { kid, designId, adult, orderId, code: wish.code };
}

describe("creature serials", () => {
  it("encodes RFC 4648 base32 (uppercase, no padding)", () => {
    const enc = (s: string) => base32(new TextEncoder().encode(s));
    expect(["", "f", "fo", "foo", "foob", "fooba", "foobar"].map(enc)).toEqual(["", "MY", "MZXQ", "MZXW6", "MZXW6YQ", "MZXW6YTB", "MZXW6YTBOI"]);
  });

  it("is BL- plus the first 5 base32 characters of the order id's 16 bytes", () => {
    expect(creatureSerial("00000000-0000-0000-0000-000000000000")).toBe("BL-AAAAA");
    expect(creatureSerial("ffffffff-ffff-ffff-ffff-ffffffffffff")).toBe("BL-77777");
    // 0x7B 0x1F 0x00 ... = 01111 01100 01111 10000 0000 -> P M P Q A
    expect(creatureSerial("7b1f0000-0000-0000-0000-000000000000")).toBe("BL-PMPQA");
    const id = crypto.randomUUID();
    expect(creatureSerial(id)).toMatch(/^BL-[A-Z2-7]{5}$/);
    expect(creatureSerial(id)).toBe(creatureSerial(id.toUpperCase()));
    expect(() => creatureSerial("not-a-uuid")).toThrow();
  });
});

describe("Creature Pack PDF", () => {
  beforeEach(async () => {
    await freshDb();
  });

  it("personalizes a creature order: cover, card and certificate, wish line, mode label everywhere, no contact data", async () => {
    const { adult, orderId, code } = await creatureOrder();
    const { pdf, filename } = await orderInstructionsPdf(adult, orderId);
    expect(filename).toBe("captain-fizzfang-creature-pack.pdf");
    const doc = await PDFDocument.load(pdf);
    const db = await getDb();
    const o = (await db.query<{ frozen_model: ReturnType<typeof buildModel> }>(`SELECT frozen_model FROM orders WHERE id = $1`, [orderId])).rows[0];
    const model = o.frozen_model;
    expect(doc.getTitle()).toContain(NAME);
    expect(doc.getAuthor()).toBeUndefined();

    const pages = await pageTexts(pdf);
    // Cover, card + certificate, parts list, one page per step.
    expect(pages).toHaveLength(3 + model.steps.length);
    for (const p of pages) expect(p).toContain("SIMULATED ORDER");

    const serial = creatureSerial(orderId);
    const bornAt = (await db.query<{ created_at: Date }>(`SELECT r.created_at FROM wishes w JOIN design_revisions r ON r.id = w.design_revision_id WHERE w.code = $1`, [code.replace("-", "")])).rows[0].created_at;
    const born = formatBornOn(bornAt);
    expect(born).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/);

    const [cover, cardPage] = pages;
    expect(cover).toContain(NAME);
    expect(cover).toContain(`Invented by ${TAG}`);
    expect(cover).toContain(`No. ${serial}  ·  Born ${born}`);
    expect(cover).not.toContain("PREVIEW");
    expect(cover).toContain("Ice power"); // default core is trans-light-blue
    expect(cover).toContain("Contains small parts. Not for children under 3 years.");
    expect(cover).toContain("Physical test build: not yet done for this design.");

    const stats = creatureStats(model);
    expect(cardPage).toContain("Your Creature Card");
    expect(cardPage).toContain("Certificate of Invention");
    expect(cardPage).toContain("Builder:");
    expect(cardPage).toContain(NAME);
    expect(cardPage).toContain(`Invented by ${TAG}`);
    expect(cardPage).toContain(serial);
    expect(cardPage).toContain(born);
    expect(cardPage).toContain(stats.title.toUpperCase());
    for (const label of ["Size", "Zoom", "Fly", "Armor", "Chomp"]) expect(cardPage).toContain(label);

    const last = pages[pages.length - 1];
    expect(model.steps[model.steps.length - 1].note).toBe(WISH_LINE);
    expect(last).toContain("Power up!");
    expect(squash(last)).toContain(WISH_LINE);
    expect(last).toContain("Parts for this step");

    // Nothing about the grown-up who bought it, anywhere in the file.
    const all = await everything(pdf);
    for (const field of CONTACT_FIELDS) expect(all).not.toContain(field);
    expect(all).not.toContain(adult);
    expect(all).not.toContain("$");
    expectNoBadClaims(all);
  });

  it("prints the same serial and born date on every download, and only for the purchaser", async () => {
    const { adult, kid, orderId } = await creatureOrder();
    const a = await pageTexts((await orderInstructionsPdf(adult, orderId)).pdf);
    const b = await pageTexts((await orderInstructionsPdf(adult, orderId)).pdf);
    expect(a[0]).toBe(b[0]);
    expect(a[1]).toBe(b[1]);
    // The kid's device (or anyone else) cannot fetch the grown-up's order booklet.
    await expect(orderInstructionsPdf(kid, orderId)).rejects.toThrow(/not found/i);
    await expect(orderInstructionsPdf(cust(), orderId)).rejects.toThrow(/not found/i);
  });

  it("design previews of a creature print PREVIEW instead of a serial, with no price or revision number", async () => {
    const kid = cust();
    const designId = await createDesign(kid, "creature");
    await applyEdits(kid, designId, [{ name: "set_identity", input: { name: [0, 0, 0], builder: [0, 0, 32] } }], "visual");
    const { pdf, filename } = await designInstructionsPdf(kid, designId);
    expect(filename).toBe("captain-fizzfang-preview.pdf");
    const pages = await pageTexts(pdf);
    const model = buildModel({ ...defaultParams("creature"), identity: { name: [0, 0, 0], builder: [0, 0, 32] } });
    expect(pages).toHaveLength(3 + model.steps.length);
    for (const p of pages) {
      expect(p).toContain("DESIGN PREVIEW - NOT AN ORDER");
      expect(p).not.toMatch(/revision \d/);
    }
    expect(pages[0]).toContain(NAME);
    expect(pages[0]).toContain(`Invented by ${TAG}`);
    expect(pages[0]).toMatch(/PREVIEW {2}· {2}Born \d{1,2} [A-Z][a-z]{2} \d{4}/);
    expect(pages[1]).toContain("Certificate of Invention");
    expect(pages[1]).toContain("PREVIEW");
    expect(squash(pages[pages.length - 1])).toContain(WISH_LINE);
    const all = await everything(pdf);
    expect(all).not.toContain("No. BL-");
    expect(all).not.toMatch(/BL-[A-Z2-7]{5}/);
    expect(all).not.toContain("$");
    expect(all).not.toMatch(/USD|\bprice\b/i);
    expectNoBadClaims(all);
  });
});

describe("Creature Pack PDF without a database", () => {
  it("follows the creature's power and name (Zap, Fire) and never draws emoji", async () => {
    for (const [core, label] of [
      ["trans-yellow", "Zap power"],
      ["trans-red", "Fire power"],
      ["trans-green", "Leaf power"],
      ["trans-clear", "Star power"],
    ] as const) {
      const p = defaultParams("creature");
      p.colors = { ...p.colors, core };
      p.options = { ...p.options, body: "long", legs: "wheels", head: "robo", back: "jetpack" };
      p.identity = { name: [1, 39, 18], builder: [5, 18, 70] };
      const model = buildModel(p);
      const creature = creaturePackInfo(model, { serial: "BL-ABCDE", bornOn: "2026-10-12T09:30:00Z" })!;
      expect(creature.name).toBe("Professor Sprocketwhisker");
      const pdf = await generateInstructionsPdf(model, { title: creature.name, modeLabel: "SIMULATED ORDER", validation: validateModel(model), creature });
      const pages = await pageTexts(pdf);
      expect(pages[0]).toContain(label);
      expect(pages[0]).toContain("No. BL-ABCDE  ·  Born 12 Oct 2026");
      expect(pages[0]).toContain("Super Zoomer");
      expect(squash(pages[pages.length - 1])).toContain("Make a wish, then click Professor Sprocketwhisker's power core into place.");
      expectNoBadClaims(pages.join("\n"));
    }
  });

  it("formats born dates in UTC", () => {
    expect(formatBornOn("2026-10-12T23:59:59Z")).toBe("12 Oct 2026");
    expect(formatBornOn(new Date("2027-01-03T00:00:00Z"))).toBe("3 Jan 2027");
    expect(formatBornOn("garbage")).toBe("");
  });

  it("returns no creature block for ready-made kits", () => {
    expect(creaturePackInfo(buildModel(defaultParams("pup")), { serial: "BL-AAAAA", bornOn: new Date() })).toBeUndefined();
  });
});

describe("ready-made kit PDFs are unchanged", () => {
  it("keep the same page count and cover text as before", async () => {
    for (const k of READY_MADE_KITS) {
      const model = buildModel(defaultParams(k.id));
      const v = validateModel(model);
      const pdf = await generateInstructionsPdf(model, { title: k.name, modeLabel: "SIMULATION", validation: v });
      const pages = await pageTexts(pdf);
      expect(pages, k.id).toHaveLength(2 + model.steps.length);
      const pieces = computeBom(model).totalPieces;
      expect(pages[0].split("\n"), k.id).toEqual([
        `BrickLoop  |  ${k.name}`,
        "SIMULATION",
        `1 / ${2 + model.steps.length}`,
        k.name,
        `${pieces} pieces  |  ${model.steps.length} steps  |  ${model.templateVersion}`,
        "FRONT",
        `Digital validation: ${v.status.toUpperCase()}${v.warnings.length ? ` (${v.warnings.length} warning(s))` : ""}`,
        `Physical test build: ${v.physicallyValidated ? "completed for this configuration" : "NOT YET PERFORMED for this configuration"}`,
        "Contains small parts. Not for children under 3 years.",
        "Original BrickLoop design. Built from genuine bricks sourced per order.",
      ]);
      const all = pages.join("\n");
      expect(all).not.toContain("Creature Card");
      expect(all).not.toContain("Certificate of Invention");
      expect(all).not.toContain("BL-");
    }
  });

  it("ready-made orders keep the plain booklet titled by order number", async () => {
    await freshDb();
    const adult = cust();
    const designId = await createDesign(adult, "pup");
    const orderId = await createOrder(adult, { designId, contact: CONTACT, adultConfirmed: true });
    const { pdf, filename } = await orderInstructionsPdf(adult, orderId);
    expect(filename).toBe(`order-${orderId.slice(0, 8)}-instructions.pdf`);
    const pages = await pageTexts(pdf);
    const model = buildModel(defaultParams("pup"));
    expect(pages).toHaveLength(2 + model.steps.length);
    expect(pages[0]).toContain(`Order ${orderId.slice(0, 8)}`);
    expect(pages[0]).toContain("frozen at checkout");
    const all = await everything(pdf);
    for (const field of CONTACT_FIELDS) expect(all).not.toContain(field);
  });
});

describe("instruction routes", () => {
  beforeEach(async () => {
    await freshDb();
    jar.token = undefined;
  });

  it("GET /api/orders/[id]/instructions serves the Creature Pack to the purchaser only", async () => {
    const { token, customerId } = newCustomerToken();
    const { orderId } = await creatureOrder(customerId);
    const { GET } = await import("@/app/api/orders/[id]/instructions/route");
    const call = () => GET(new Request(`http://localhost/api/orders/${orderId}/instructions`), { params: Promise.resolve({ id: orderId }) });

    jar.token = token;
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('inline; filename="captain-fizzfang-creature-pack.pdf"');
    const pages = await pageTexts(new Uint8Array(await res.arrayBuffer()));
    expect(pages[0]).toContain(`No. ${creatureSerial(orderId)}`);

    jar.token = newCustomerToken().token;
    expect((await call()).status).toBe(404);
    jar.token = undefined;
    expect((await call()).status).toBe(404);
  });

  it("GET /api/designs/[id]/instructions serves a PREVIEW pack for the owner's creature", async () => {
    const { token, customerId } = newCustomerToken();
    const designId = await createDesign(customerId, "creature");
    const { GET } = await import("@/app/api/designs/[id]/instructions/route");
    const call = () => GET(new Request(`http://localhost/api/designs/${designId}/instructions`), { params: Promise.resolve({ id: designId }) });
    jar.token = token;
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^inline; filename="[a-z0-9-]+-preview\.pdf"$/);
    const pages = await pageTexts(new Uint8Array(await res.arrayBuffer()));
    expect(pages[0]).toContain("PREVIEW");
    expect(pages.join("\n")).not.toContain("No. BL-");
    jar.token = newCustomerToken().token;
    expect((await call()).status).toBe(404);
  });
});
