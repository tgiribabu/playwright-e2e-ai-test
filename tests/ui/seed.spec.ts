/** Seed test used by the Playwright AI agents to open the app with framework fixtures. */
import { test } from '../../src/fixtures';

/** Seed for the Playwright Copilot agents (planner/generator): opens the app with the framework's fixtures. */
test('seed @ui', async ({ page, config }) => {
  test.skip(!config.api, 'demo-app environments only');
  await page.goto('/login');
});
