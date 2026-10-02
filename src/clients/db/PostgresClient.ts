/** PostgreSQL client: pooled, parameterized queries, transactions, polling, read-only guard. */
import { Pool, PoolClient, QueryResultRow } from 'pg';
import type { AppConfig } from '../../config/ConfigManager';
import { createLogger } from '../../core/logger';

const log = createLogger('db');

/** Statements allowed in read-only environments (after stripping comments). */
const READ_ONLY = /^\s*(SELECT|WITH|SHOW|EXPLAIN)\b/i;
const stripComments = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * PostgreSQL client for test validation and seeding.
 *  - connection pooling (one pool per worker), statement timeout, application_name for DBA visibility
 *  - parameterized queries only ($1, $2 …); values are never concatenated into SQL
 *  - read-only environments reject anything but SELECT/WITH
 */
export class PostgresClient {
  private constructor(private readonly pool: Pool, private readonly readOnly: boolean) {}

  static fromConfig(config: AppConfig): PostgresClient {
    const db = config.db;
    if (!db) throw new Error(`Environment ${config.env} has no database configured`);
    const pool = new Pool({
      host: db.host, port: db.port, database: db.database, user: db.user, password: db.password,
      ssl: db.ssl ? { rejectUnauthorized: true } : undefined,
      max: db.poolMax, statement_timeout: db.statementTimeoutMs, application_name: `playwright-tests:${config.tenant.id}`,
      idleTimeoutMillis: 10_000,
    });
    pool.on('error', (err) => log.error(`idle client error: ${err.message}`));
    return new PostgresClient(pool, config.readOnly);
  }

  async query<T extends QueryResultRow = QueryResultRow>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    this.assertAllowed(sql);
    const started = Date.now();
    const res = await this.pool.query<T>(sql, params as unknown[]);
    log.debug(`${res.rowCount ?? 0} row(s) in ${Date.now() - started}ms: ${sql.replace(/\s+/g, ' ').slice(0, 120)}`);
    return res.rows;
  }

  /** Exactly one row, otherwise throws (catches ambiguous test data early). */
  async one<T extends QueryResultRow = QueryResultRow>(sql: string, params: readonly unknown[] = []): Promise<T> {
    const rows = await this.query<T>(sql, params);
    if (rows.length !== 1) throw new Error(`Expected 1 row, got ${rows.length}: ${sql.replace(/\s+/g, ' ').slice(0, 160)} ${JSON.stringify(params)}`);
    return rows[0]!;
  }

  async maybeOne<T extends QueryResultRow = QueryResultRow>(sql: string, params: readonly unknown[] = []): Promise<T | undefined> {
    return (await this.query<T>(sql, params))[0];
  }

  async scalar<T = unknown>(sql: string, params: readonly unknown[] = []): Promise<T> {
    const row = await this.one(sql, params);
    return Object.values(row)[0] as T;
  }

  /** Runs `fn` in a transaction; rolls back on error. */
  async transaction<T>(fn: (q: <R extends QueryResultRow>(sql: string, p?: readonly unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
    if (this.readOnly) throw new Error('[read-only env] transactions are not allowed');
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(async (sql, p = []) => (await client.query(sql, p as unknown[])).rows);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** Polls until `predicate(rows)` holds: for state written asynchronously (queues, integrations). */
  async waitFor<T extends QueryResultRow = QueryResultRow>(
    sql: string, params: readonly unknown[], predicate: (rows: T[]) => boolean, { timeoutMs = 30_000, intervalMs = 500 } = {},
  ): Promise<T[]> {
    const deadline = Date.now() + timeoutMs;
    let last: T[] = [];
    while (Date.now() < deadline) {
      last = await this.query<T>(sql, params);
      if (predicate(last)) return last;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`DB condition not met within ${timeoutMs}ms. Last rows: ${JSON.stringify(last).slice(0, 500)}`);
  }

  async ping(): Promise<{ version: string; latencyMs: number }> {
    const started = Date.now();
    const version = await this.scalar<string>('SELECT version()');
    return { version: version.split(' on ')[0] ?? version, latencyMs: Date.now() - started };
  }

  async close(): Promise<void> { await this.pool.end(); }

  private assertAllowed(sql: string): void {
    if (this.readOnly && !READ_ONLY.test(stripComments(sql))) {
      throw new Error(`[read-only env] statement blocked: ${sql.trim().split(/\s+/).slice(0, 4).join(' ')} …`);
    }
  }
}
