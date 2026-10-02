/** Fixture layer 0: resolved environment + tenant config. */
import { test as base } from '@playwright/test';
import { AppConfig, getConfig } from '../config/ConfigManager';

/** Layer 0: the resolved environment + tenant config (one per worker). */
export const test = base.extend<{ _envAnnotation: void }, { config: AppConfig }>({
  config: [async ({}, use) => { await use(getConfig()); }, { scope: 'worker' }],

  // Stamps env/tenant onto every test so reports show where it ran.
  _envAnnotation: [async ({ config }, use, testInfo) => {
    testInfo.annotations.push({ type: 'environment', description: `${config.env} / ${config.tenant.id}` });
    await use();
  }, { auto: true }],
});
