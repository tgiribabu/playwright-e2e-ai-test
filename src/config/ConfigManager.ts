/** Loads config/environments/<env>.json + tenant overrides + secrets into a frozen AppConfig. */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { EnvFileSchema, EnvFile, ApiSettings, DbSettings, SalesforceSettings } from './env.schema';
import { resolveSecret, resolveOptionalSecret } from './secrets';

const ROOT = path.resolve(__dirname, '../..');
const ENV_DIR = path.join(ROOT, 'config/environments');

export interface AppConfig {
  env: string;
  readOnly: boolean;
  tenant: { id: string; displayName: string };
  ui: { baseUrl: string; credentials?: { username: string; password: string } };
  api?: ApiSettings & { credentials: { username: string; password: string } };
  db?: DbSettings & { password: string };
  salesforce?: SalesforceSettings & { clientId: string; clientSecret?: string; username?: string; privateKeyPath?: string };
  /** Config with secret values masked: safe to log or attach to reports. */
  safeSummary(): Record<string, unknown>;
}

export function availableEnvironments(): string[] {
  return fs.readdirSync(ENV_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
}

/** Reads + validates config/environments/<env>.json (no secrets involved). */
export function readEnvFile(env: string): EnvFile {
  const file = path.join(ENV_DIR, `${env}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Unknown TEST_ENV "${env}". Available: ${availableEnvironments().join(', ')}`);
  }
  const parsed = EnvFileSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid ${path.relative(ROOT, file)}:\n${issues}`);
  }
  return parsed.data;
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return (override ?? base) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(out[k] ?? {}, v) : v;
  }
  return out as T;
}

/**
 * Builds the runtime config for one environment + tenant.
 * Order: config/environments/<env>.json  →  tenant overrides  →  secrets from env vars (.env.<env>, .env).
 */
export function buildConfig(env: string, tenantId?: string): AppConfig {
  dotenv.config({ path: [path.join(ROOT, `.env.${env}`), path.join(ROOT, '.env')], quiet: true });

  const file = readEnvFile(env);
  const tenant = tenantId ?? file.defaultTenant;
  const tenantDef = file.tenants[tenant];
  if (!tenantDef) throw new Error(`Unknown TENANT "${tenant}" for env ${env}. Available: ${Object.keys(file.tenants).join(', ')}`);

  const merged = EnvFileSchema.parse(deepMerge(file, tenantDef.overrides ?? {}));
  const s = (name: string) => resolveSecret(name, env, tenant);
  const opt = (name?: string) => resolveOptionalSecret(name, env, tenant);

  const config: AppConfig = {
    env,
    readOnly: merged.readOnly,
    tenant: { id: tenant, displayName: tenantDef.displayName },
    ui: {
      baseUrl: merged.ui.baseUrl,
      credentials: merged.ui.usernameSecret && merged.ui.passwordSecret
        ? { username: s(merged.ui.usernameSecret), password: s(merged.ui.passwordSecret) } : undefined,
    },
    api: merged.api && {
      ...merged.api,
      credentials: { username: s(merged.api.usernameSecret), password: s(merged.api.passwordSecret) },
    },
    db: merged.db && { ...merged.db, password: s(merged.db.passwordSecret) },
    salesforce: merged.salesforce && {
      ...merged.salesforce,
      clientId: s(merged.salesforce.clientIdSecret),
      clientSecret: opt(merged.salesforce.clientSecretSecret),
      username: opt(merged.salesforce.usernameSecret),
      privateKeyPath: opt(merged.salesforce.privateKeyPathSecret),
    },
    safeSummary() {
      return JSON.parse(JSON.stringify(this, (key, value) =>
        /password|secret|token|credentials|privateKey|clientId/i.test(key) ? '***' : value));
    },
  };
  return Object.freeze(config);
}

let cached: AppConfig | undefined;

/** The active config for this run: TEST_ENV (default "local") and TENANT (default from the env file). */
export function getConfig(): AppConfig {
  cached ??= buildConfig(process.env.TEST_ENV ?? 'local', process.env.TENANT || undefined);
  return cached;
}

/** Active tenant id without resolving secrets (safe at test-collection time, e.g. for data-driven titles). */
export function activeTenantId(): string {
  return process.env.TENANT || getEnvFile().defaultTenant;
}

/** Lightweight, secret-free view used by playwright.config.ts (it must load even before secrets exist). */
export function getEnvFile(): EnvFile {
  return readEnvFile(process.env.TEST_ENV ?? 'local');
}
