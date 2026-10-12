import fs from "node:fs";
import path from "node:path";
import type { Db } from "./index";

export function migrationsDir(): string {
  return path.resolve(process.env.MIGRATIONS_DIR || path.join(process.cwd(), "db", "migrations"));
}

export async function runMigrations(db: Db): Promise<string[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const dir = migrationsDir();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await db.query<{ name: string }>(`SELECT name FROM schema_migrations`);
  const done = new Set(rows.map((r) => r.name));
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    await db.exec(`BEGIN;\n${sql}\nINSERT INTO schema_migrations(name) VALUES ('${f.replace(/'/g, "''")}');\nCOMMIT;`);
    applied.push(f);
  }
  return applied;
}
