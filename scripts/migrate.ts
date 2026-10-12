/** Apply database migrations (PostgreSQL when DATABASE_URL is set, otherwise the local PGlite directory). */
import { getDb } from "../src/lib/db";
import { runMigrations } from "../src/lib/db/migrate";

const db = await getDb(); // runs pending migrations on first use
const again = await runMigrations(db);
const { rows } = await db.query<{ name: string; applied_at: string }>(`SELECT name, applied_at FROM schema_migrations ORDER BY name`);
console.log(`Database: ${db.kind}. Applied migrations:`);
for (const r of rows) console.log(`  ${r.name}  ${new Date(r.applied_at).toISOString()}`);
if (again.length) console.log(`Newly applied: ${again.join(", ")}`);
await db.close();
