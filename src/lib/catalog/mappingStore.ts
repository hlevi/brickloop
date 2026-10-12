import { getDb, type Queryable } from "../db";
import { audit } from "../audit";
import { COLORS } from "./colors";
import { PARTS } from "./parts";
import { defaultMapping, type ExternalMapping, type MappingLookup } from "./mappings";
import { AppError } from "../util";

interface Row {
  part_id: string;
  color_id: string;
  external_item_id: string | null;
  external_color_id: number | null;
  status: ExternalMapping["status"];
  source: string;
  verified_at: Date | string | null;
}

/** Mapping lookup: database rows (admin-verified) override the provisional static table. */
export async function loadMappingLookup(q?: Queryable): Promise<MappingLookup> {
  const db = q ?? (await getDb());
  const { rows } = await db.query<Row>(`SELECT * FROM part_mappings WHERE supplier = 'bricklink'`);
  const byKey = new Map(rows.map((r) => [`${r.part_id}|${r.color_id}`, r]));
  return (partId, colorId) => {
    const r = byKey.get(`${partId}|${colorId}`);
    if (!r) return defaultMapping(partId, colorId);
    return {
      partId,
      colorId,
      supplier: "bricklink",
      externalItemId: r.external_item_id,
      externalColorId: r.external_color_id,
      status: r.status,
      source: r.source,
      verifiedAt: r.verified_at ? new Date(r.verified_at).toISOString() : null,
    };
  };
}

/** Admin: record a mapping as verified (or unresolved) with its evidence. */
export async function setMapping(
  input: { partId: string; colorId: string; externalItemId: string; externalColorId: number; status: "verified" | "unresolved"; source: string },
  actor: string,
) {
  if (!PARTS[input.partId] || !COLORS[input.colorId]) throw new AppError("invalid_mapping", "Unknown part or color");
  if (!input.source || input.source.trim().length < 8) throw new AppError("invalid_mapping", "A source (URL or agreement reference) is required");
  if (!/^[A-Za-z0-9-]+$/.test(input.externalItemId) || !Number.isInteger(input.externalColorId)) throw new AppError("invalid_mapping", "Invalid external identifiers");
  const db = await getDb();
  await db.tx(async (q) => {
    await q.query(
      `INSERT INTO part_mappings(part_id, color_id, supplier, external_item_id, external_color_id, status, source, verified_at, verified_by, updated_at)
       VALUES ($1,$2,'bricklink',$3,$4,$5,$6, CASE WHEN $5 = 'verified' THEN now() ELSE NULL END, $7, now())
       ON CONFLICT (part_id, color_id, supplier) DO UPDATE SET external_item_id = EXCLUDED.external_item_id, external_color_id = EXCLUDED.external_color_id,
         status = EXCLUDED.status, source = EXCLUDED.source, verified_at = EXCLUDED.verified_at, verified_by = EXCLUDED.verified_by, updated_at = now()`,
      [input.partId, input.colorId, input.externalItemId, input.externalColorId, input.status, input.source.trim(), actor],
    );
    await audit(q, actor, "mapping.set", "part_mapping", `${input.partId}|${input.colorId}`, input);
  });
}
