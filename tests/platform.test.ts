import { beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { checkAdminPassword, customerIdFromToken, isAdminToken, newAdminToken, newCustomerToken, sign } from "@/lib/auth/session";
import { createDesign } from "@/lib/designs";
import { environmentalReport } from "@/lib/environment";
import { computeBom } from "@/lib/bom/bom";
import { generateInstructionsPdf } from "@/lib/instructions/pdf";
import { enqueue, runReadyJobs } from "@/lib/jobs/queue";
import { buildModel, defaultParams } from "@/lib/model/templates";
import { liveReadiness } from "@/lib/orders/live";
import { redact } from "@/lib/redact";
import { getSupplier } from "@/lib/suppliers/registry";
import { UnsupportedOperationError } from "@/lib/suppliers/types";
import { UnverifiedSupplier, CANDIDATE_SUPPLIERS } from "@/lib/suppliers/unverified";
import { validateModel } from "@/lib/validation/validate";
import { handleWebhook, signWebhook, verifyWebhookSignature } from "@/lib/webhooks";
import { freshDb } from "./helpers";


describe("platform", () => {
  beforeEach(async () => {
    await freshDb();
  });

  it("verifies webhook signatures and ignores duplicates", async () => {
    const secret = process.env.WEBHOOK_SECRET || "dev-webhook-secret";
    const body = JSON.stringify({ id: "evt_1", type: "shipment.updated", data: { orderId: crypto.randomUUID() } });
    expect(verifyWebhookSignature(body, signWebhook(body, secret), secret)).toBe(true);
    expect(verifyWebhookSignature(body, signWebhook(body, "wrong"), secret)).toBe(false);
    expect(verifyWebhookSignature(body + " ", signWebhook(body, secret), secret)).toBe(false);
    expect(verifyWebhookSignature(body, signWebhook(body, secret, Math.floor(Date.now() / 1000) - 3600), secret)).toBe(false);
    await expect(handleWebhook("simulator", body, "t=1,v1=00")).rejects.toThrow(/signature/);
    const first = await handleWebhook("simulator", body, signWebhook(body, secret));
    const second = await handleWebhook("simulator", body, signWebhook(body, secret));
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    const db = await getDb();
    expect((await db.query(`SELECT * FROM webhook_events`)).rows).toHaveLength(1);
    expect((await db.query(`SELECT * FROM jobs WHERE type = 'order.track'`)).rows).toHaveLength(1);
  });

  it("signs sessions and rejects tampering; admin requires a strong configured password", () => {
    const { token, customerId } = newCustomerToken();
    expect(customerIdFromToken(token)).toBe(customerId);
    const [body] = token.split(".");
    expect(customerIdFromToken(`${body}.forged`)).toBeNull();
    expect(customerIdFromToken(sign({ cid: "x" }).replace(/.$/, "A"))).toBeNull();
    expect(isAdminToken(newAdminToken())).toBe(true);
    expect(isAdminToken(token)).toBe(false);
    expect(isAdminToken(sign({ role: "admin", exp: Date.now() - 1000 }))).toBe(false);
    const prev = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_PASSWORD = "short";
    expect(checkAdminPassword("short")).toBe(false);
    process.env.ADMIN_PASSWORD = "a-long-enough-password";
    expect(checkAdminPassword("a-long-enough-password")).toBe(true);
    expect(checkAdminPassword("a-long-enough-passwore")).toBe(false);
    process.env.ADMIN_PASSWORD = prev;
  });

  it("generates instruction PDFs with a cover, parts list and one page per step", async () => {
    const model = buildModel(defaultParams("cottage"));
    const pdf = await generateInstructionsPdf(model, { title: "Test House", modeLabel: "SIMULATION", validation: validateModel(model) });
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(2 + model.steps.length);
    expect(doc.getTitle()).toContain("Test House");
  });

  it("redacts secrets and payment details from logs", () => {
    const r = redact({ password: "hunter2", apiKey: "sk-123", nested: { card: "4242", note: "card 4242 4242 4242 4242 by pat@example.com" } });
    expect(r.password).toBe("[redacted]");
    expect(r.apiKey).toBe("[redacted]");
    expect(r.nested.card).toBe("[redacted]");
    expect(r.nested.note).not.toContain("4242 4242");
    expect(r.nested.note).toContain("p***@example.com");
  });

  it("keeps live purchasing disabled and real suppliers unsupported", async () => {
    const r = await liveReadiness();
    expect(r.ready).toBe(false);
    for (const info of CANDIDATE_SUPPLIERS) {
      expect(Object.values(info.capabilities).every((v) => v === false)).toBe(true);
      await expect(new UnverifiedSupplier(info).purchase()).rejects.toBeInstanceOf(UnsupportedOperationError);
    }
    expect(() => getSupplier("bricklink")).toThrow(/allowlist/);
  });

  it("reports environmental data honestly", () => {
    const bom = computeBom(buildModel(defaultParams("pup")));
    const env = environmentalReport(bom, "new");
    expect(env.reusedWeightGrams).toBe(0);
    expect(env.carbonComparison.enabled).toBe(false);
    const reused = environmentalReport(bom, "reused");
    expect(reused.reusedWeightGrams).toBeNull(); // no reliable weights: no number is reported
  });

  it("retries failing jobs with bounded attempts, then marks them dead", async () => {
    const db = await getDb();
    await enqueue(db, "test.fail", {}, { maxAttempts: 3, dedupeKey: "t1" });
    await enqueue(db, "test.fail", {}, { maxAttempts: 3, dedupeKey: "t1" }); // deduped
    let dead = 0;
    for (let i = 0; i < 5; i++) {
      await db.query(`UPDATE jobs SET run_at = now()`);
      await runReadyJobs({ "test.fail": async () => { throw new Error("boom"); } }, { onDead: async () => { dead++; } });
    }
    const j = (await db.query<{ status: string; attempts: number }>(`SELECT status, attempts FROM jobs`)).rows;
    expect(j).toEqual([{ status: "dead", attempts: 3 }]);
    expect(dead).toBe(1);
  });
});
