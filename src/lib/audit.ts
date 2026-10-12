import type { Queryable } from "./db";
import { redact } from "./redact";

export async function audit(q: Queryable, actor: string, action: string, entityType: string, entityId: string | null, data: unknown = {}) {
  await q.query(`INSERT INTO audit_events(actor, action, entity_type, entity_id, data) VALUES ($1,$2,$3,$4,$5)`, [
    actor,
    action,
    entityType,
    entityId,
    JSON.stringify(redact(data ?? {})),
  ]);
}
