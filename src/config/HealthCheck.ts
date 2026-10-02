/** Pre-flight health check of UI, API, PostgreSQL and Salesforce for the active env/tenant. */
import { request } from '@playwright/test';
import type { AppConfig } from './ConfigManager';
import { PostgresClient } from '../clients/db/PostgresClient';
import { SoqlClient } from '../clients/salesforce/SoqlClient';
import { fetchApiToken } from '../clients/api/ApiClient';

export type HealthStatus = 'UP' | 'DOWN' | 'SKIPPED';
export interface HealthResult { component: string; status: HealthStatus; required: boolean; latencyMs?: number; detail: string }

async function timed(fn: () => Promise<string>): Promise<{ ok: boolean; latencyMs: number; detail: string }> {
  const started = Date.now();
  try {
    const detail = await fn(); // await BEFORE reading the clock, or latency is always ~0ms
    return { ok: true, latencyMs: Date.now() - started, detail };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - started, detail: String(e instanceof Error ? e.message : e).split('\n')[0]!.slice(0, 200) };
  }
}

/**
 * Pre-flight validation of the target environment. Components that are not configured for the env are SKIPPED;
 * a required component that is DOWN fails the run before any test starts (no 200 red tests for one outage).
 */
export async function checkEnvironmentHealth(config: AppConfig): Promise<HealthResult[]> {
  const results: HealthResult[] = [];
  const push = (component: string, required: boolean, r: Awaited<ReturnType<typeof timed>>) =>
    results.push({ component, required, status: r.ok ? 'UP' : 'DOWN', latencyMs: r.latencyMs, detail: r.detail });

  push('ui', true, await timed(async () => {
    const ctx = await request.newContext();
    try {
      const res = await ctx.get(config.ui.baseUrl, { maxRedirects: 5, failOnStatusCode: false });
      if (res.status() >= 500) throw new Error(`HTTP ${res.status()}`);
      return `HTTP ${res.status()} ${config.ui.baseUrl}`;
    } finally { await ctx.dispose(); }
  }));

  if (config.api) {
    const api = config.api;
    push('api', api.required, await timed(async () => {
      const ctx = await request.newContext({ baseURL: api.baseUrl });
      try {
        const res = await ctx.get(api.healthPath, { failOnStatusCode: false });
        if (!res.ok()) throw new Error(`${api.healthPath} → HTTP ${res.status()}`);
        await fetchApiToken(config); // credentials valid for this tenant
        return `${api.healthPath} OK, auth OK for tenant ${config.tenant.id}`;
      } finally { await ctx.dispose(); }
    }));
  } else results.push({ component: 'api', required: false, status: 'SKIPPED', detail: 'not configured for this environment' });

  if (config.db) {
    push('postgres', config.db.required, await timed(async () => {
      const db = PostgresClient.fromConfig(config);
      try { const p = await db.ping(); return `${p.version} @ ${config.db!.host}/${config.db!.database}`; } finally { await db.close(); }
    }));
  } else results.push({ component: 'postgres', required: false, status: 'SKIPPED', detail: 'not configured for this environment' });

  if (config.salesforce) {
    push('salesforce', config.salesforce.required, await timed(async () => {
      const sf = new SoqlClient(config);
      try {
        const limits = (await sf.limits()) as { DailyApiRequests?: { Remaining: number; Max: number } };
        const d = limits.DailyApiRequests;
        if (d && d.Remaining < d.Max * 0.05) throw new Error(`API limit nearly exhausted: ${d.Remaining}/${d.Max}`);
        return `token OK, API requests remaining ${d ? `${d.Remaining}/${d.Max}` : 'n/a'}`;
      } finally { await sf.dispose(); }
    }));
  } else results.push({ component: 'salesforce', required: false, status: 'SKIPPED', detail: 'not configured for this environment' });

  return results;
}

export function formatHealth(config: AppConfig, results: HealthResult[]): string {
  const rows = results.map((r) => `  ${r.status.padEnd(7)} ${r.component.padEnd(11)} ${(r.latencyMs !== undefined ? `${r.latencyMs}ms` : '').padEnd(7)} ${r.required ? 'required' : 'optional'}  ${r.detail}`);
  return [`Environment health: ${config.env} / tenant ${config.tenant.id}${config.readOnly ? ' (READ-ONLY)' : ''}`, ...rows].join('\n');
}
