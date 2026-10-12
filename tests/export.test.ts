import { describe, expect, it } from "vitest";
import { computeBom } from "@/lib/bom/bom";
import { bomToBrickLinkXml, bomToCsv, ExportBlockedError } from "@/lib/bom/export";
import { defaultMapping, type MappingLookup } from "@/lib/catalog/mappings";
import { buildModel, defaultParams } from "@/lib/model/templates";

const model = buildModel(defaultParams("racer"));

describe("exports", () => {
  it("CSV quantities match the BOM, including accessories", () => {
    const bom = computeBom(model);
    const csv = bomToCsv(bom).trim().split("\n");
    expect(csv.length).toBe(bom.lines.length + 1);
    const total = csv.slice(1).reduce((n, row) => n + Number(row.split(",")[4]), 0);
    expect(total).toBe(bom.totalPieces);
    expect(csv.some((r) => r.startsWith("tire-14x4,") && r.includes(",4,"))).toBe(true);
  });

  it("blocks BrickLink XML when mappings are not verified", () => {
    const bom = computeBom(model);
    expect(bom.liveSourcingReady).toBe(false);
    expect(() => bomToBrickLinkXml(bom)).toThrow(ExportBlockedError);
  });

  it("produces wanted-list XML with a warning when provisional ids are explicitly allowed", () => {
    const xml = bomToBrickLinkXml(computeBom(model), { allowProvisional: true, condition: "U" });
    expect(xml).toMatch(/WARNING: \d+ line\(s\) use PROVISIONAL/);
    expect(xml).toContain("<ITEMID>4600</ITEMID>");
    expect((xml.match(/<ITEM>/g) ?? []).length).toBe(computeBom(model).lines.length);
    expect(xml).toMatch(/<CONDITION>U<\/CONDITION>/);
  });

  it("exports cleanly with verified mappings and sums quantities", () => {
    const verified: MappingLookup = (p, c) => ({ ...defaultMapping(p, c), status: "verified", verifiedAt: "2026-10-12" });
    const bom = computeBom(model, verified);
    expect(bom.liveSourcingReady).toBe(true);
    const xml = bomToBrickLinkXml(bom);
    expect(xml).not.toContain("WARNING");
    const qty = [...xml.matchAll(/<MINQTY>(\d+)<\/MINQTY>/g)].reduce((n, m) => n + Number(m[1]), 0);
    expect(qty).toBe(bom.totalPieces);
  });

  it("flags unresolved mappings", () => {
    const lookup: MappingLookup = (p, c) => (p === "tire-14x4" ? { ...defaultMapping(p, c), externalItemId: null, status: "unresolved" } : defaultMapping(p, c));
    const bom = computeBom(model, lookup);
    expect(bom.unresolved.some((l) => l.partId === "tire-14x4")).toBe(true);
    expect(() => bomToBrickLinkXml(bom, { allowProvisional: true })).toThrow(/lack a verified mapping/);
  });
});
