import { defineConfig } from '@playwright/test';
import { getEnvFile } from './src/config/ConfigManager';
import { selectDevices } from './config/devices';

/**
 * EXAMPLE H: parallel, sharded, multi-device configuration.
 *
 *   TEST_ENV=qa TENANT=globex DEVICES=desktop,mobile npx playwright test --shard=2/4
 *
 * Project graph:
 *   health ──► api            (API + DB tests: no browser, run ONCE, not once per device)
 *          └─► <each device>  (UI + showcase tests, one project per browser/device)
 *   unit                      (framework self-tests, no environment needed)
 */
const env = getEnvFile(); // secret-free view: the config must load even where secrets are absent
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  outputDir: 'test-results/artifacts',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  // CI runners: half the vCPUs per shard. Locally: Playwright's default (half the cores).
  workers: CI ? '50%' : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Production is read-only: never schedule tests that change data there.
  grepInvert: env.readOnly ? /@mutating/ : undefined,
  reporter: [
    [CI ? 'dot' : 'list'],
    ...(CI ? [['blob'] as const] : []),           // shards upload blobs; a CI job merges them
    ['html', { open: 'never' }],
    ['allure-playwright', { resultsDir: 'allure-results', environmentInfo: { env: env.name, tenant: process.env.TENANT ?? env.defaultTenant, node: process.version } }],
    ['./src/reporters/self-heal.reporter.ts'],
  ],
  use: {
    baseURL: env.ui.baseUrl,
    trace: CI ? 'retain-on-first-failure' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: CI ? 'retain-on-failure' : 'off',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    testIdAttribute: 'data-testid',
  },
  projects: [
    { name: 'unit', testMatch: /tests\/unit\/.*\.spec\.ts/ },
    { name: 'health', testMatch: /tests\/setup\/health\.setup\.ts/ },
    { name: 'api', testMatch: /tests\/(api|db)\/.*\.spec\.ts/, dependencies: ['health'] },
    ...selectDevices().map((device) => ({
      ...device,
      testMatch: /tests\/(ui|showcase)\/.*\.spec\.ts/,
      dependencies: ['health'],
    })),
  ],
});
