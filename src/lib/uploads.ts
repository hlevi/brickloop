import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "./db";
import { audit } from "./audit";
import { env } from "./config";
import { AppError, isUuid, uuid } from "./util";
import { isLabKit } from "./model/templates";

const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/webp", ext: "webp", test: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
];

/** Identify by magic bytes; the client-declared type and file name are not trusted. */
export function sniffImage(buf: Buffer): { mime: string; ext: string } | null {
  const s = SIGNATURES.find((s) => buf.length >= 12 && s.test(buf));
  return s ? { mime: s.mime, ext: s.ext } : null;
}

const MAX_PER_DESIGN = 5;

/**
 * Store an inspiration image for later review. Images are not processed into
 * models; they are kept outside the public directory and served only to their owner.
 */
export async function saveUpload(customerId: string, designId: string, originalName: string, buf: Buffer) {
  if (!isUuid(designId)) throw new AppError("not_found", "Design not found", 404);
  if (buf.length === 0) throw new AppError("empty_file", "The file is empty");
  if (buf.length > env.uploadMaxBytes) throw new AppError("too_large", `Images must be ${Math.round(env.uploadMaxBytes / 1024 / 1024)} MB or smaller`, 413);
  const kind = sniffImage(buf);
  if (!kind) throw new AppError("bad_type", "Only PNG, JPEG or WebP images are accepted", 415);
  const db = await getDb();
  const own = await db.query<{ template: string }>(`SELECT template FROM designs WHERE id = $1 AND customer_id = $2`, [designId, customerId]);
  // Kid-mode (Lab) designs never accept photos.
  if (!own.rows[0] || isLabKit(own.rows[0].template)) throw new AppError("not_found", "Design not found", 404);
  const count = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM uploads WHERE design_id = $1`, [designId]);
  if (Number(count.rows[0].n) >= MAX_PER_DESIGN) throw new AppError("too_many", `At most ${MAX_PER_DESIGN} images per design`, 409);
  const id = uuid();
  const dir = path.resolve(env.uploadDir, customerId);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${id}.${kind.ext}`);
  fs.writeFileSync(file, buf, { mode: 0o600 });
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const safeName = originalName.replace(/[^\w.\- ]+/g, "_").slice(0, 100) || "image";
  await db.tx(async (q) => {
    await q.query(`INSERT INTO uploads(id, customer_id, design_id, original_name, mime, size_bytes, sha256, storage_path) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [
      id,
      customerId,
      designId,
      safeName,
      kind.mime,
      buf.length,
      sha,
      file,
    ]);
    await audit(q, `customer:${customerId}`, "upload.create", "upload", id, { designId, size: buf.length, mime: kind.mime });
  });
  return { id, mime: kind.mime, size: buf.length, name: safeName };
}

export async function listUploads(customerId: string, designId: string) {
  const db = await getDb();
  const { rows } = await db.query<{ id: string; original_name: string; mime: string; size_bytes: number; review_status: string; created_at: string }>(
    `SELECT id, original_name, mime, size_bytes, review_status, created_at FROM uploads WHERE design_id = $1 AND customer_id = $2 ORDER BY created_at`,
    [designId, customerId],
  );
  return rows;
}

export async function readUpload(customerId: string | null, uploadId: string, admin = false) {
  if (!isUuid(uploadId)) throw new AppError("not_found", "Not found", 404);
  const db = await getDb();
  const { rows } = await db.query<{ customer_id: string; mime: string; storage_path: string }>(`SELECT customer_id, mime, storage_path FROM uploads WHERE id = $1`, [uploadId]);
  const r = rows[0];
  if (!r || (!admin && r.customer_id !== customerId)) throw new AppError("not_found", "Not found", 404);
  const root = path.resolve(env.uploadDir);
  const resolved = path.resolve(r.storage_path);
  if (!resolved.startsWith(root + path.sep)) throw new AppError("not_found", "Not found", 404);
  return { mime: r.mime, data: fs.readFileSync(resolved) };
}
