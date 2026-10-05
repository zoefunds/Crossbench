import pg from "pg";
const { Pool } = pg;
export class DbStatement {
  private values: unknown[] = [];
  constructor(private readonly pool: pg.Pool, private readonly sql: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  private translated() { let i = 0; return this.sql.replace(/\?/g, () => `$${++i}`); }
  async run() { await this.pool.query(this.translated(), this.values); return { success: true }; }
  async all<T = Record<string, unknown>>() { const result = await this.pool.query(this.translated(), this.values); return { results: result.rows as T[] }; }
  async first<T = Record<string, unknown>>() { const result = await this.pool.query(this.translated(), this.values); return (result.rows[0] as T | undefined) ?? null; }
}
export class Database {
  readonly pool: pg.Pool;
  constructor(connectionString: string) { this.pool = new Pool({ connectionString, max: Number(process.env.DB_POOL_MAX ?? 10), ssl: process.env.DB_SSL === "require" ? { rejectUnauthorized: false } : undefined }); }
  prepare(sql: string) { return new DbStatement(this.pool, sql); }
  async withAdvisoryLock<T>(key: string, wait: boolean, work: () => Promise<T>): Promise<T | undefined> {
    const client = await this.pool.connect();
    try {
      const lockSql = wait ? `SELECT pg_advisory_lock(hashtext($1)) AS acquired` : `SELECT pg_try_advisory_lock(hashtext($1)) AS acquired`;
      const result = await client.query<{ acquired: boolean }>(lockSql, [key]);
      if (!wait && !result.rows[0]?.acquired) return undefined;
      try { return await work(); }
      finally { await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [key]); }
    } finally {
      client.release();
    }
  }
  async close() { await this.pool.end(); }
}
export class ExpiringStore {
  constructor(private readonly db: Database) {}
  async put(key: string, value: string, options?: { expirationTtl?: number }) { const expires = new Date(Date.now() + (options?.expirationTtl ?? 86400) * 1000).toISOString(); await this.db.prepare(`INSERT INTO kv_store (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`).bind(key, value, expires).run(); }
  async get(key: string) { const row = await this.db.prepare(`SELECT value FROM kv_store WHERE key = ? AND expires_at > ?`).bind(key, new Date().toISOString()).first<{ value: string }>(); return row?.value ?? null; }
  async delete(key: string) { await this.db.prepare(`DELETE FROM kv_store WHERE key = ?`).bind(key).run(); }
}
