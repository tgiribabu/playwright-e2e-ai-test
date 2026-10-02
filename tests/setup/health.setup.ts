/** Health gate project: fails fast when a required environment component is down. */
import { test as setup } from '@playwright/test';
import { getConfig } from '../../src/config/ConfigManager';
import { checkEnvironmentHealth, formatHealth } from '../../src/config/HealthCheck';

/**
 * Runs once before every UI/API project (see playwright.config.ts dependencies).
 * If a REQUIRED component is down, every dependent test is skipped instead of failing one by one.
 */
setup('environment health check', async ({}, testInfo) => {
  const config = getConfig();
  const results = await checkEnvironmentHealth(config);
  const table = formatHealth(config, results);
  console.log(`\n${table}\n`);
  await testInfo.attach('health.json', { body: JSON.stringify({ config: config.safeSummary(), results }, null, 2), contentType: 'application/json' });

  const down = results.filter((r) => r.required && r.status === 'DOWN');
  if (down.length) throw new Error(`Environment not healthy:\n${table}`);
});
