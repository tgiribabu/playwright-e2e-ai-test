/** Salesforce SOQL client: pagination, re-auth, polling, injection-safe soql`` template. */
import { APIRequestContext, request } from '@playwright/test';
import type { AppConfig } from '../../config/ConfigManager';
import { SalesforceTokenManager } from './SalesforceTokenManager';

type Primitive = string | number | boolean | null | Date;
export type SObjectRow = Record<string, unknown> & { Id?: string };

/** Escapes a value for a SOQL string literal. */
export const soqlEscape = (v: string) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');

/** Injection-safe SOQL: soql`SELECT Id FROM Account WHERE Name = ${name}` (values quoted and escaped). */
export function soql(strings: TemplateStringsArray, ...values: Array<Primitive | Primitive[]>): string {
  const fmt = (v: Primitive): string =>
    v === null ? 'null' : v instanceof Date ? v.toISOString() : typeof v === 'string' ? `'${soqlEscape(v)}'` : String(v);
  return strings.reduce((acc, s, i) => {
    if (i >= values.length) return acc + s;
    const v = values[i]!;
    return acc + s + (Array.isArray(v) ? `(${v.map(fmt).join(',')})` : fmt(v));
  }, '');
}

/** SOQL over Salesforce REST (/services/data/vXX.X/query): pagination, re-auth on expiry, polling. */
export class SoqlClient {
  private ctx?: APIRequestContext;
  constructor(private readonly config: AppConfig, private readonly tokens = new SalesforceTokenManager(config)) {}

  private async context(force = false): Promise<APIRequestContext> {
    if (this.ctx && !force) return this.ctx;
    await this.ctx?.dispose();
    const t = await this.tokens.get(force);
    this.ctx = await request.newContext({ baseURL: t.instanceUrl, extraHTTPHeaders: { Authorization: `Bearer ${t.accessToken}` } });
    return this.ctx;
  }

  private async get<T>(path: string, retry = true): Promise<T> {
    const res = await (await this.context()).get(path, { failOnStatusCode: false });
    if (res.status() === 401 && retry) { await this.context(true); return this.get<T>(path, false); }
    if (!res.ok()) throw new Error(`Salesforce GET ${path} failed [${res.status()}]: ${await res.text()}`);
    return (await res.json()) as T;
  }

  async query<T extends SObjectRow = SObjectRow>(q: string): Promise<T[]> {
    const v = this.config.salesforce!.apiVersion;
    let page = await this.get<{ records: T[]; done: boolean; nextRecordsUrl?: string }>(`/services/data/v${v}/query?q=${encodeURIComponent(q)}`);
    const rows = [...page.records];
    while (!page.done && page.nextRecordsUrl) {
      page = await this.get(page.nextRecordsUrl);
      rows.push(...page.records);
    }
    return rows.map(({ attributes: _a, ...rest }) => rest as unknown as T);
  }

  async queryOne<T extends SObjectRow = SObjectRow>(q: string): Promise<T> {
    const rows = await this.query<T>(q);
    if (rows.length !== 1) throw new Error(`Expected 1 Salesforce record, got ${rows.length}: ${q}`);
    return rows[0]!;
  }

  /** Polls a query: integrations and Flows update Salesforce asynchronously. */
  async waitFor<T extends SObjectRow = SObjectRow>(q: string, predicate: (rows: T[]) => boolean, { timeoutMs = 30_000, intervalMs = 1_000 } = {}): Promise<T[]> {
    const deadline = Date.now() + timeoutMs;
    let last: T[] = [];
    while (Date.now() < deadline) {
      last = await this.query<T>(q);
      if (predicate(last)) return last;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`Salesforce condition not met within ${timeoutMs}ms for: ${q}. Last: ${JSON.stringify(last).slice(0, 400)}`);
  }

  async limits(): Promise<Record<string, unknown>> {
    return this.get(`/services/data/v${this.config.salesforce!.apiVersion}/limits`);
  }

  async dispose(): Promise<void> { await this.ctx?.dispose(); }
}
