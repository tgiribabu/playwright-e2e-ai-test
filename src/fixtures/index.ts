/** The `test` object for every spec: merges all fixture layers. */
import { mergeTests, expect } from '@playwright/test';
import { test as dataTest } from './data.fixture';
import { test as filesTest } from './files.fixture';
import { test as uiTest } from './ui.fixture';

/**
 * THE test object for every spec:  import { test, expect } from '../../src/fixtures';
 *
 *   config            worker  environment + tenant (secrets resolved, frozen)
 *   api               test    authenticated, tenant-scoped ApiClient (Playwright APIRequestContext)
 *   db                worker  PostgresClient (pooled, parameterized, read-only in prod)
 *   sf                worker  SoqlClient (OAuth JWT / client credentials)
 *   testData          test    TestDataProvider: excel/json/csv/db/soql/api sources with zod validation
 *   cleanup           test    LIFO undo registry
 *   files             test    SecureFileSystem sandbox
 *   loginPage, appointmentsPage, curaLoginPage, curaAppointmentPage   page objects
 */
export const test = mergeTests(dataTest, filesTest, uiTest);
export { expect };
export type { Cleanup } from './data.fixture';
