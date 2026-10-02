/** Single entry point for test data: Excel, JSON, CSV, PostgreSQL, SOQL, API, all zod-validated. */
import * as path from 'path';
import { z } from 'zod';
import type { AppConfig } from '../config/ConfigManager';
import type { PostgresClient } from '../clients/db/PostgresClient';
import type { SoqlClient } from '../clients/salesforce/SoqlClient';
import type { ApiClient } from '../clients/api/ApiClient';
import { readExcel, Row } from './sources/excel.source';
import { readCsv, readJson } from './sources/file.sources';

const DATA_DIR = path.resolve(__dirname, '../../data');

/**
 * One entry point for every test-data source. Paths are relative to /data.
 * Every reader can take a zod schema: bad data fails fast with a precise message instead of
 * surfacing later as a confusing UI failure.
 */
export class TestDataProvider {
  constructor(
    private readonly config: AppConfig,
    private readonly clients: { db?: () => PostgresClient; sf?: () => SoqlClient; api?: () => Promise<ApiClient> },
  ) {}

  // ---------- files ----------
  async excel<S extends z.ZodTypeAny>(file: string, schema: S, opts: { sheet?: string; where?: (r: Row) => boolean } = {}): Promise<Array<z.infer<S>>> {
    const rows = (await readExcel(path.join(DATA_DIR, file), opts.sheet)).filter(opts.where ?? (() => true));
    return rows.map((r, i) => validate(schema, r, `${file} row ${i + 2}`));
  }

  /** The single Excel row for a test case id (column TC_ID by default). */
  async excelCase<S extends z.ZodTypeAny>(file: string, tcId: string, schema: S, idColumn = 'TC_ID'): Promise<z.infer<S>> {
    const rows = await this.excel(file, schema, { where: (r) => r[idColumn] === tcId });
    if (rows.length !== 1) throw new Error(`Expected one row with ${idColumn}=${tcId} in ${file}, found ${rows.length}`);
    return rows[0];
  }

  json<S extends z.ZodTypeAny>(file: string, schema: S): z.infer<S> {
    return validate(schema, readJson(path.join(DATA_DIR, file)), file);
  }

  csv<S extends z.ZodTypeAny>(file: string, schema: S): Array<z.infer<S>> {
    return readCsv(path.join(DATA_DIR, file)).map((r, i) => validate(schema, r, `${file} row ${i + 2}`));
  }

  // ---------- live systems ----------
  async db<S extends z.ZodTypeAny>(sql: string, params: readonly unknown[], schema: S): Promise<Array<z.infer<S>>> {
    if (!this.clients.db) throw new Error(`No database configured for env ${this.config.env}`);
    return (await this.clients.db().query(sql, params)).map((r, i) => validate(schema, r, `db row ${i + 1}`));
  }

  async soql<S extends z.ZodTypeAny>(query: string, schema: S): Promise<Array<z.infer<S>>> {
    if (!this.clients.sf) throw new Error(`No Salesforce configured for env ${this.config.env}`);
    return (await this.clients.sf().query(query)).map((r, i) => validate(schema, r, `SOQL record ${i + 1}`));
  }

  async api<S extends z.ZodTypeAny>(path: string, schema: S): Promise<z.infer<S>> {
    if (!this.clients.api) throw new Error(`No API configured for env ${this.config.env}`);
    return (await (await this.clients.api()).get(path, { expectStatus: 200, schema })).body;
  }

  /** Unique, traceable value for this run and worker, e.g. "PW-acme-3-lq2x9". */
  uniqueTag(prefix = 'PW'): string {
    return `${prefix}-${this.config.tenant.id}-${process.env.TEST_WORKER_INDEX ?? 0}-${Date.now().toString(36)}`;
  }
}

function validate<S extends z.ZodTypeAny>(schema: S, value: unknown, where: string): z.infer<S> {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw new Error(`Invalid test data in ${where}: ${r.error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ')}`);
  }
  return r.data;
}
