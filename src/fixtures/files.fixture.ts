/** Fixture layer 2: per-test SecureFileSystem sandbox. */
import { test as configTest } from './config.fixture';
import { SecureFileSystem } from '../files/SecureFileSystem';

/** Layer 2: per-test file sandbox under the test's output dir. Deleted on pass, kept on failure for debugging. */
export const test = configTest.extend<{ files: SecureFileSystem }>({
  files: async ({}, use, testInfo) => {
    const sandbox = new SecureFileSystem(testInfo.outputPath('sandbox'));
    await use(sandbox);
    if (testInfo.status === testInfo.expectedStatus) sandbox.destroy();
  },
});
