/** Fixture layer 1: api, apiToken, db, sf clients. */
import { test as configTest } from './config.fixture';
import { ApiClient, createApiContext, fetchApiToken } from '../clients/api/ApiClient';
import { PostgresClient } from '../clients/db/PostgresClient';
import { SoqlClient } from '../clients/salesforce/SoqlClient';

type WorkerClients = { apiToken: string; db: PostgresClient; sf: SoqlClient };
type TestClients = { api: ApiClient };

/** Layer 1: backend clients. Worker-scoped connections (pool, tokens) are created lazily and only when used. */
export const test = configTest.extend<TestClients, WorkerClients>({
  apiToken: [async ({ config }, use) => { await use(await fetchApiToken(config)); }, { scope: 'worker' }],

  db: [async ({ config }, use) => {
    const db = PostgresClient.fromConfig(config);
    await use(db);
    await db.close();
  }, { scope: 'worker' }],

  sf: [async ({ config }, use) => {
    const sf = new SoqlClient(config);
    await use(sf);
    await sf.dispose();
  }, { scope: 'worker' }],

  /** Authenticated, tenant-scoped API client built on Playwright's APIRequestContext. */
  api: async ({ config, apiToken }, use) => {
    const ctx = await createApiContext(config, apiToken);
    await use(new ApiClient(ctx, config.readOnly));
    await ctx.dispose();
  },
});
