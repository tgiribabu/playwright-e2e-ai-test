/** Salesforce OAuth token manager (JWT Bearer / Client Credentials), one token per worker. */
import { createSign } from 'crypto';
import * as fs from 'fs';
import { request } from '@playwright/test';
import type { AppConfig } from '../../config/ConfigManager';

export interface SalesforceToken { accessToken: string; instanceUrl: string; expiresAt: number }

/**
 * OAuth 2.0 for Salesforce:
 *  - JWT Bearer (server-to-server as a named integration user; certificate on the Connected App)
 *  - Client Credentials (runs as the app's "Run As" user; token endpoint must be the My Domain URL)
 * One token per worker, de-duplicated across concurrent callers, refreshed before the session timeout.
 */
export class SalesforceTokenManager {
  private token?: SalesforceToken;
  private inflight?: Promise<SalesforceToken>;

  constructor(private readonly config: AppConfig, private readonly ttlMs = 60 * 60_000) {}

  async get(forceRefresh = false): Promise<SalesforceToken> {
    if (!forceRefresh && this.token && Date.now() < this.token.expiresAt - 60_000) return this.token;
    this.inflight ??= this.fetch().finally(() => { this.inflight = undefined; });
    this.token = await this.inflight;
    return this.token;
  }

  private async fetch(): Promise<SalesforceToken> {
    const sf = this.config.salesforce;
    if (!sf) throw new Error(`Environment ${this.config.env} has no Salesforce configured`);
    const form: Record<string, string> = sf.authFlow === 'jwt'
      ? { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: this.jwt() }
      : { grant_type: 'client_credentials', client_id: sf.clientId, client_secret: sf.clientSecret ?? '' };
    const endpoint = sf.authFlow === 'jwt' ? sf.loginUrl : (sf.instanceUrl ?? sf.loginUrl);

    const ctx = await request.newContext();
    try {
      const res = await ctx.post(`${endpoint}/services/oauth2/token`, { form, failOnStatusCode: false });
      const body = (await res.json().catch(() => ({}))) as { access_token?: string; instance_url?: string; error?: string; error_description?: string };
      if (!res.ok() || !body.access_token || !body.instance_url) {
        throw new Error(`Salesforce ${sf.authFlow} auth failed [${res.status()}]: ${body.error ?? ''} ${body.error_description ?? ''}`);
      }
      return { accessToken: body.access_token, instanceUrl: body.instance_url, expiresAt: Date.now() + this.ttlMs };
    } finally {
      await ctx.dispose();
    }
  }

  private jwt(): string {
    const sf = this.config.salesforce!;
    if (!sf.username || !sf.privateKeyPath) throw new Error('JWT flow needs usernameSecret and privateKeyPathSecret');
    const b64 = (v: string | Buffer) => Buffer.from(v).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64(JSON.stringify({ iss: sf.clientId, sub: sf.username, aud: sf.loginUrl, exp: Math.floor(Date.now() / 1000) + 180 }));
    const signer = createSign('RSA-SHA256');
    signer.update(`${head}.${claims}`);
    return `${head}.${claims}.${b64(signer.sign(fs.readFileSync(sf.privateKeyPath, 'utf8')))}`;
  }
}
