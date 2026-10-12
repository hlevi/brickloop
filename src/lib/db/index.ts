import fs from "node:fs";
import path from "node:path";
import { runMigrations } from "./migrate";

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Db extends Queryable {
  kind: "pglite" | "postgres";
  exec(sql: string): Promise<void>;
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

async function createPglite(dataDir: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir !== "memory://") fs.mkdirSync(path.resolve(dataDir), { recursive: true });
  const pg = dataDir === "memory://" ? new PGlite() : new PGlite(path.resolve(dataDir));
  await pg.waitReady;
  // PGlite is single-connection: serialize transactions so they don't interleave.
  let chain: Promise<unknown> = Promise.resolve();
  const db: Db = {
    kind: "pglite",
    async query(sql, params) {
      const r = await pg.query(sql, params as unknown[] | undefined);
      return { rows: r.rows as never[] };
    },
    async exec(sql) {
      await pg.exec(sql);
    },
    tx(fn) {
      const run = chain.then(() =>
        pg.transaction(async (t) =>
          fn({
            async query(sql, params) {
              const r = await t.query(sql, params as unknown[] | undefined);
              return { rows: r.rows as never[] };
            },
          }),
        ),
      );
      chain = run.catch(() => undefined);
      return run;
    },
    async close() {
      await pg.close();
    },
  };
  return db;
}

async function createPostgres(url: string): Promise<Db> {
  const pgmod = await import("pg");
  const Pool = pgmod.default?.Pool ?? (pgmod as unknown as { Pool: typeof import("pg").Pool }).Pool;
  const pool = new Pool({ connectionString: url, max: 10 });
  return {
    kind: "postgres",
    async query(sql, params) {
      const r = await pool.query(sql, params as unknown[] | undefined);
      return { rows: r.rows };
    },
    async exec(sql) {
      await pool.query(sql);
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn({
          async query(sql, params) {
            const r = await client.query(sql, params as unknown[] | undefined);
            return { rows: r.rows };
          },
        });
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

const g = globalThis as unknown as { __brickloopDb?: Promise<Db> };

/** Process-wide database handle; migrations run on first use. */
export function getDb(): Promise<Db> {
  if (!g.__brickloopDb) {
    g.__brickloopDb = (async () => {
      const url = process.env.DATABASE_URL;
      const db = url ? await createPostgres(url) : await createPglite(process.env.PGLITE_DIR || "./.data/pglite");
      await runMigrations(db);
      return db;
    })();
    g.__brickloopDb.catch(() => {
      g.__brickloopDb = undefined;
    });
  }
  return g.__brickloopDb;
}

/** Tests: replace the process database with a fresh in-memory instance. */
export async function resetDbForTests(): Promise<Db> {
  if (g.__brickloopDb) {
    const old = await g.__brickloopDb.catch(() => null);
    await old?.close().catch(() => undefined);
  }
  g.__brickloopDb = (async () => {
    const db = await createPglite("memory://");
    await runMigrations(db);
    return db;
  })();
  return g.__brickloopDb;
}
