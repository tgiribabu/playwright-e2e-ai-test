/** CURA demo-site UI tests (ported originals), CSV-driven. */
import { z } from 'zod';
import { test, expect } from '../../../src/fixtures';
import { readCsv } from '../../../src/data/sources/file.sources';
import * as path from 'path';

/**
 * Port of the original tests/demo/login.spec.ts + locators.spec.ts (CURA demo site).
 * Run with: npm run test:cura   (TEST_ENV=cura)
 *
 * What changed vs the originals:
 *  - selectors moved to src/ui/pages/cura/*.locators.ts (no duplicated getByRole calls)
 *  - credentials come from config secrets (CURA_UI_USERNAME / CURA_UI_PASSWORD), not literals
 *  - every test asserts an outcome (the old "invalid flow" test and getele.count.spec.ts asserted nothing)
 *  - CSV rows are validated; visitDt from the CSV is actually used (it was ignored before)
 */
const Booking = z.object({
  testid: z.string(),
  facility: z.string(),
  hcp: z.enum(['Medicare', 'Medicaid', 'None']),
  visitDt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const bookings = readCsv(path.resolve(__dirname, '../../../data/csv/cura-bookings.csv')).map((r) => Booking.parse(r));

test.describe('CURA appointment booking @cura @ui', () => {
  test.beforeEach(async ({ config, curaLoginPage }) => {
    test.skip(config.env !== 'cura', 'runs against the CURA demo site (TEST_ENV=cura)');
    await curaLoginPage.open();
    await curaLoginPage.goToLogin();
  });

  for (const b of bookings) {
    test(`${b.testid}: book at ${b.facility} (${b.hcp})`, async ({ config, curaLoginPage, curaAppointmentPage }) => {
      await curaLoginPage.login(config.ui.credentials!.username, config.ui.credentials!.password);
      const booking = { facility: b.facility, program: b.hcp, visitDate: b.visitDt, comment: `Booked by ${b.testid}` } as const;

      expect(await curaAppointmentPage.facilityOptions()).toContain(b.facility);
      await curaAppointmentPage.book(booking);
      await curaAppointmentPage.expectConfirmed(booking);
    });
  }

  test('invalid credentials are rejected', async ({ curaLoginPage }) => {
    await curaLoginPage.login('John Do', 'wrong-password');
    await curaLoginPage.expectLoginFailed();
  });
});
