import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { PDFArray, PDFDocument, PDFName, PDFRawStream, type PDFRef } from "pdf-lib";
import { newCustomerToken } from "@/lib/auth/session";
import { createCardDesign } from "@/lib/designs";
import { defaultCardParams, listedCards } from "@/lib/cards/catalog";
import { orderInstructionsPdf } from "@/lib/instructions/files";
import { generateInstructionsPdf } from "@/lib/instructions/pdf";
import { computeBom } from "@/lib/bom/bom";
import { buildModel } from "@/lib/model/templates";
import { createOrder } from "@/lib/orders/service";
import { validateModel } from "@/lib/validation/validate";
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
const CONTACT_FIELDS = [CONTACT.name, CONTACT.email, CONTACT.shipTo.line1, CONTACT.shipTo.city, CONTACT.shipTo.postalCode, "Example", "example.com"];
const CARD = {
  sendTo: "recipient",
  message: "Happy birthday, Sam!",
  signature: "Pat",
  font: "classic",
  recipient: { name: "Sam Recipient", line1: "2 Elm Street", city: "Shelbyville", region: "IL", postalCode: "62565", country: "US" },
};

async function cardOrder(customerId: string = cust(), cardId = "puppy-love") {
  const designId = await createCardDesign(customerId, cardId);
  const orderId = await createOrder(customerId, { designId, contact: CONTACT, adultConfirmed: true, card: CARD });
  return { designId, orderId };
}

describe("booklets", () => {
  it.each(listedCards().map((c) => [c.id, c] as const))("%s: cover, parts page and one page per step", async (_id, card) => {
    const model = buildModel(defaultCardParams(card));
    const v = validateModel(model);
    const pdf = await generateInstructionsPdf(model, { title: card.title, modeLabel: "SIMULATION", validation: v });
    const pages = await pageTexts(pdf);
    expect(pages).toHaveLength(2 + model.steps.length);
    const pieces = computeBom(model).totalPieces;
    expect(pages[0]).toContain(card.title);
    expect(pages[0]).toContain(`${pieces} pieces`);
    expect(pages[0]).toContain("Contains small parts. Not for children under 3 years.");
    for (const p of pages) expect(p).toContain("SIMULATION");
  });

  it("an order's booklet is titled by its card and never contains purchaser or recipient details", async () => {
    await freshDb();
    const c = cust();
    const { orderId } = await cardOrder(c);
    const { pdf, filename } = await orderInstructionsPdf(c, orderId);
    expect(filename).toBe("puppy-love-instructions.pdf");
    const pages = await pageTexts(pdf);
    expect(pages[0]).toContain("Puppy Love");
    expect(pages[0]).toContain("frozen at checkout");
    const all = await everything(pdf);
    for (const field of [...CONTACT_FIELDS, CARD.recipient.name, CARD.recipient.line1]) expect(all).not.toContain(field);
  });
});

describe("instruction routes", () => {
  beforeEach(async () => {
    await freshDb();
    jar.token = undefined;
  });

  it("GET /api/orders/[id]/instructions serves the booklet to the purchaser only", async () => {
    const { token, customerId } = newCustomerToken();
    const { orderId } = await cardOrder(customerId);
    const { GET } = await import("@/app/api/orders/[id]/instructions/route");
    const call = () => GET(new Request(`http://localhost/api/orders/${orderId}/instructions`), { params: Promise.resolve({ id: orderId }) });
    jar.token = token;
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('inline; filename="puppy-love-instructions.pdf"');
    jar.token = newCustomerToken().token;
    expect((await call()).status).toBe(404);
    jar.token = undefined;
    expect((await call()).status).toBe(404);
  });

  it("GET /api/designs/[id]/instructions serves a preview to the design's owner only", async () => {
    const { token, customerId } = newCustomerToken();
    const designId = await createCardDesign(customerId, "brick-heart");
    const { GET } = await import("@/app/api/designs/[id]/instructions/route");
    const call = () => GET(new Request(`http://localhost/api/designs/${designId}/instructions`), { params: Promise.resolve({ id: designId }) });
    jar.token = token;
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('inline; filename="brick-heart-mosaic-preview.pdf"');
    const pages = await pageTexts(new Uint8Array(await res.arrayBuffer()));
    expect(pages[0]).toContain("DESIGN PREVIEW");
    jar.token = newCustomerToken().token;
    expect((await call()).status).toBe(404);
  });
});
