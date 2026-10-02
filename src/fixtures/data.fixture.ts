/** Fixture layer 2: testData provider and cleanup registry. */
import { test as clientsTest } from './clients.fixture';
import { TestDataProvider } from '../data/TestDataProvider';
import { ApiClient, createApiContext, fetchApiToken } from '../clients/api/ApiClient';
import { PostgresClient } from '../clients/db/PostgresClient';
import { SoqlClient } from '../clients/salesforce/SoqlClient';
import { createLogger } from '../core/logger';

const log = createLogger('cleanup');

/** Registers undo actions; they run in reverse order after the test, even when it fails. */
export class Cleanup {
  private readonly tasks: Array<{ label: string; fn: () => Promise<unknown> }> = [];
  add(label: string, fn: () => Promise<unknown>): void { this.tasks.push({ label, fn }); }
  async run(): Promise<string[]> {
    const failures: string[] = [];
    for (const t of this.tasks.reverse()) {
      try { await t.fn(); } catch (e) { failures.push(`${t.label}: ${(e as Error).message}`); }
    }
    return failures;
  }
}

/** Layer 2: test data (multi-source provider) + cleanup registry. */
export const test = clientsTest.extend<{ testData: TestDataProvider; cleanup: Cleanup }>({
  // Clients are lazy: a test that only reads Excel never opens a DB pool or a Salesforce session.
  testData: async ({ config }, use) => {
    let db: PostgresClient | undefined;
    let sf: SoqlClient | undefined;
    let api: ApiClient | undefined;
    await use(new TestDataProvider(config, {
      db: config.db ? () => (db ??= PostgresClient.fromConfig(config)) : undefined,
      sf: config.salesforce ? () => (sf ??= new SoqlClient(config)) : undefined,
      api: config.api ? async () => (api ??= new ApiClient(await createApiContext(config, await fetchApiToken(config)), config.readOnly)) : undefined,
    }));
    await Promise.allSettled([db?.close(), sf?.dispose(), api?.ctx.dispose()]);
  },

  cleanup: async ({}, use, testInfo) => {
    const cleanup = new Cleanup();
    await use(cleanup);
    const failures = await cleanup.run();
    for (const f of failures) {
      log.warn(f);
      testInfo.annotations.push({ type: 'cleanup-failed', description: f });
    }
  },
});
