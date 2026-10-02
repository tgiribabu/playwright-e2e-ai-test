/** Typed API client over Playwright APIRequestContext: status checks, zod schemas, read-only guard, auth. */
import { APIRequestContext, APIResponse, expect, request } from '@playwright/test';
import { z } from 'zod';
import type { AppConfig } from '../../config/ConfigManager';
import { createLogger } from '../../core/logger';

const log = createLogger('api');

export interface RequestOptions<S extends z.ZodTypeAny | undefined> {
  data?: unknown;
  params?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  /** Expected HTTP status. The call fails with the response body when the status differs. */
  expectStatus?: number;
  /** zod schema: the body is validated and returned typed. */
  schema?: S;
}

export interface ApiResult<T> { status: number; body: T; headers: Record<string, string>; response: APIResponse }

type Body<S> = S extends z.ZodTypeAny ? z.infer<S> : unknown;

/**
 * Typed wrapper over Playwright's APIRequestContext.
 *  - status assertion with the response body in the failure message
 *  - zod schema validation (contract check + static types)
 *  - read-only environments (prod): non-GET requests are refused before they are sent
 */
export class ApiClient {
  constructor(readonly ctx: APIRequestContext, private readonly readOnly = false) {}

  get<S extends z.ZodTypeAny | undefined = undefined>(path: string, o: RequestOptions<S> = {}) { return this.send('GET', path, o); }
  post<S extends z.ZodTypeAny | undefined = undefined>(path: string, o: RequestOptions<S> = {}) { return this.send('POST', path, o); }
  put<S extends z.ZodTypeAny | undefined = undefined>(path: string, o: RequestOptions<S> = {}) { return this.send('PUT', path, o); }
  patch<S extends z.ZodTypeAny | undefined = undefined>(path: string, o: RequestOptions<S> = {}) { return this.send('PATCH', path, o); }
  delete<S extends z.ZodTypeAny | undefined = undefined>(path: string, o: RequestOptions<S> = {}) { return this.send('DELETE', path, o); }

  async send<S extends z.ZodTypeAny | undefined>(method: string, path: string, o: RequestOptions<S>): Promise<ApiResult<Body<S>>> {
    if (this.readOnly && method !== 'GET' && method !== 'HEAD') {
      throw new Error(`[read-only env] ${method} ${path} blocked: this environment only allows read requests.`);
    }
    const started = Date.now();
    const response = await this.ctx.fetch(path, { method, data: o.data, params: o.params, headers: o.headers, failOnStatusCode: false });
    const text = await response.text();
    log.debug(`${method} ${path} → ${response.status()} (${Date.now() - started}ms)`);

    if (o.expectStatus !== undefined) {
      expect(response.status(), `${method} ${path} returned ${response.status()}: ${text.slice(0, 500)}`).toBe(o.expectStatus);
    }
    let body: unknown = text;
    if ((response.headers()['content-type'] ?? '').includes('json') && text) body = JSON.parse(text);
    if (o.schema) {
      const parsed = (o.schema as z.ZodTypeAny).safeParse(body);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
        throw new Error(`${method} ${path}: response does not match schema → ${issues}\nBody: ${text.slice(0, 500)}`);
      }
      body = parsed.data;
    }
    return { status: response.status(), body: body as Body<S>, headers: response.headers(), response };
  }
}

/** Exchanges the configured API credentials for a bearer token (cached per worker by the fixture). */
export async function fetchApiToken(config: AppConfig): Promise<string> {
  if (!config.api) throw new Error(`Environment ${config.env} has no API configured`);
  const ctx = await request.newContext({ baseURL: config.api.baseUrl });
  try {
    const res = await ctx.post(config.api.tokenPath, {
      data: { username: config.api.credentials.username, password: config.api.credentials.password, tenant: config.tenant.id },
      failOnStatusCode: false,
    });
    if (!res.ok()) throw new Error(`API auth failed for tenant ${config.tenant.id}: ${res.status()} ${await res.text()}`);
    return ((await res.json()) as { access_token: string }).access_token;
  } finally {
    await ctx.dispose();
  }
}

/** Authenticated, tenant-scoped APIRequestContext. */
export async function createApiContext(config: AppConfig, token: string): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: config.api!.baseUrl,
    timeout: config.api!.timeoutMs,
    extraHTTPHeaders: { Authorization: `Bearer ${token}`, 'X-Tenant-Id': config.tenant.id, Accept: 'application/json' },
  });
}
