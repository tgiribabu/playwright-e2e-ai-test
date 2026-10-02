/** Master showcase: one test using every framework layer end to end (Example I). */
/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *  EXAMPLE I: MASTER SHOWCASE. One test that uses every layer of the framework.
 *
 *  Run locally (demo stack):   npm run demo:up      # terminal 1: UI + API + Salesforce mock on PostgreSQL
 *                              npm run test:showcase # terminal 2: health check, then this test
 *  Device matrix:              DEVICES=desktop,mobile npm run test:showcase
 *  Another tenant:             TENANT=globex npm run test:showcase   (TC-APPT data must exist for that tenant)
 *  See self-healing:           DEMO_DRIFT=1 npm run demo:up   → the Save button's test id changes,
 *                              the locator heals via its role fallback, and the heal is reported.
 *
 *  Flow:  1 data (Excel + JSON + PostgreSQL + Salesforce)  →  2 API setup  →  3 browser/device
 *         4 UI via page objects, components and self-healing locators  →  5 file validation
 *         6 backend verification (PostgreSQL + Salesforce SOQL)  →  automatic cleanup
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

// ONE import gives every fixture: config, api, db, sf, testData, files, cleanup and all page objects.
import { test, expect } from '../../src/fixtures';
import { buildAppointmentCase } from '../../src/data/builders/appointment-case.builder';
import { PatientSchema } from '../../src/schemas/appointment.schemas';
import { validateFile } from '../../src/files/FileValidator';
import { soql } from '../../src/clients/salesforce/SoqlClient';

test.describe('Master showcase @showcase', () => {
  // Data-driven by Excel test-case id. Add a row to data/excel/appointment-cases.xlsx → add an id here.
  for (const tcId of ['TC-APPT-001']) {
    test(`${tcId}: book an appointment end to end @mutating`, async ({
      config,            // env + tenant (secrets resolved, frozen)
      testData,          // multi-source data provider
      api,               // authenticated, tenant-scoped API client (Playwright APIRequestContext)
      db,                // PostgreSQL (pooled, parameterized)
      sf,                // Salesforce SOQL client (OAuth)
      files,             // secure per-test file sandbox
      cleanup,           // LIFO undo registry: runs even when the test fails
      loginPage,         // page objects built on *.locators.ts files + reusable components
      appointmentsPage,
    }, testInfo) => {
      // ── 1. MULTI-SOURCE TEST DATA ─────────────────────────────────────────────────────────────
      // Excel row (TC parameters) + JSON (export rules) + PostgreSQL (insurance plan must be active)
      // + Salesforce (facility Id/Name). Every source is zod-validated, so bad data fails here,
      // with the file/row/field named, instead of as a confusing UI failure later.
      const tc = await test.step('1. Build test case from Excel + JSON + PostgreSQL + Salesforce', () =>
        buildAppointmentCase(testData, tcId, config.tenant.id));
      testInfo.annotations.push({ type: 'test-case', description: `${tc.tcId} → ${tc.facility.Name} / ${tc.insurance.code}` });

      // ── 2. API SETUP ──────────────────────────────────────────────────────────────────────────
      // Arrange through the API (fast, deterministic), act through the UI. The response is validated
      // against the PatientSchema contract and cleanup is registered immediately.
      const patient = await test.step('2. Create the patient via API', async () => {
        const res = await api.post('/api/patients', {
          data: { fullName: tc.patientName, insuranceCode: tc.insurance.code },
          expectStatus: 201,
          schema: PatientSchema,
        });
        cleanup.add(`delete patient ${res.body.mrn}`, () => api.delete(`/api/patients/${res.body.mrn}`, { expectStatus: 204 }));
        return res.body;
      });

      // ── 3. BROWSER / DEVICE ───────────────────────────────────────────────────────────────────
      // Nothing to launch by hand: `page` comes from the project this test runs in (chromium, firefox,
      // webkit, Pixel 7, iPhone 14 …, chosen by DEVICES in config/devices.ts). Projects run in parallel
      // workers and can be split across CI machines with --shard.
      await test.step(`3. Running on "${testInfo.project.name}"`, async () => {
        testInfo.annotations.push({ type: 'device', description: testInfo.project.name });
      });

      // ── 4. UI: PAGE OBJECTS + REUSABLE COMPONENTS + SELF-HEALING LOCATORS ─────────────────────
      // The test never sees a selector. LoginPage/AppointmentsPage bind their *.locators.ts files into
      // SmartLocators (primary strategy + fallbacks). AppointmentsPage composes the reusable Modal,
      // Dropdown, DataTable and Toast components. The dialog's Save button uses the agreed test id as
      // primary and heals through its role fallback if the id changes (DEMO_DRIFT=1).
      const reference = await test.step('4. Book the appointment in the UI', async () => {
        await loginPage.open();
        await loginPage.login(config.ui.credentials!.username, config.ui.credentials!.password, config.tenant.id);
        await appointmentsPage.expectLoaded(config.tenant.displayName);

        const ref = await appointmentsPage.createAppointment({
          patientMrn: patient.mrn,
          facilityName: tc.facility.Name,   // display name from Salesforce, not hard-coded
          visitDate: tc.visitDate,          // computed from the Excel offset
          comment: tc.comment,
        });

        // Reusable DataTable component: waits until the new row is rendered, matched by column values.
        await appointmentsPage.table.expectRow({
          Reference: ref, 'Patient MRN': patient.mrn, Facility: tc.facility.Name, 'Visit date': tc.visitDate, Status: tc.expectedStatus,
        });
        return ref;
      });

      // ── 5. FILE DOWNLOAD + VALIDATION ─────────────────────────────────────────────────────────
      // Downloads land in the SecureFileSystem sandbox (sanitized names, no path traversal, quota).
      // validateFile checks name, extension, REAL MIME type from magic bytes, size and content.
      await test.step('5a. Export CSV and validate it', async () => {
        const csvPath = await files.saveDownload(await appointmentsPage.exportCsv());
        const report = await validateFile(csvPath, {
          extensions: ['.csv'],
          fileNamePattern: new RegExp(`^appointments-${config.tenant.id}\\.csv$`),
          maxBytes: tc.exportRules.maxFileBytes,
          csv: { requiredColumns: tc.exportRules.csvColumns, minRows: 1 },
        });
        await testInfo.attach('csv-validation.json', { body: JSON.stringify(report.file, null, 2), contentType: 'application/json' });
        expect(report.problems, `CSV problems: ${report.problems.join('; ')}`).toEqual([]);
        expect(report.rows).toContainEqual(expect.objectContaining({ Reference: reference, 'Patient MRN': patient.mrn, Status: tc.expectedStatus }));
      });

      await test.step('5b. Export Excel and validate it (magic bytes must say XLSX, not just the extension)', async () => {
        const xlsxPath = await files.saveDownload(await appointmentsPage.exportExcel());
        const report = await validateFile(xlsxPath, {
          extensions: ['.xlsx'],
          maxBytes: tc.exportRules.maxFileBytes,
          xlsx: { sheets: ['Appointments'], requiredColumns: tc.exportRules.csvColumns, minRows: 1 },
        });
        expect(report.problems).toEqual([]);
        expect(report.file.mime).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        expect(report.rows?.some((r) => r.Reference === reference)).toBe(true);
      });

      // ── 6. BACKEND VERIFICATION ───────────────────────────────────────────────────────────────
      // The UI said "created"; the source of truth must agree. PostgreSQL is written synchronously.
      await test.step('6a. Verify PostgreSQL state', async () => {
        const row = await db.one<{ status: string; tenant_id: string; facility_code: string; visit_date: string; mrn: string; comment: string }>(`
          SELECT a.status, a.tenant_id, a.facility_code, to_char(a.visit_date, 'YYYY-MM-DD') AS visit_date, p.mrn, a.comment
          FROM appointments a JOIN patients p ON p.id = a.patient_id
          WHERE a.reference = $1`, [reference]);
        expect(row).toEqual({
          status: tc.expectedStatus, tenant_id: config.tenant.id, facility_code: tc.facility.Code__c,
          visit_date: tc.visitDate, mrn: patient.mrn, comment: tc.comment,
        });
      });

      // Salesforce is updated asynchronously by the integration, so poll instead of sleeping.
      await test.step('6b. Verify Salesforce via SOQL (async integration)', async () => {
        const [record] = await sf.waitFor<{ Id: string; Status__c: string; Facility__c: string; Patient_MRN__c: string }>(
          soql`SELECT Id, Status__c, Facility__c, Patient_MRN__c FROM Appointment__c WHERE Reference__c = ${reference}`,
          (rows) => rows.length === 1,
          { timeoutMs: 20_000 },
        );
        expect(record).toMatchObject({ Status__c: 'Scheduled', Facility__c: tc.facility.Id, Patient_MRN__c: patient.mrn });
      });
      // Cleanup (registered in step 2) deletes the patient, which cascades to the appointment
      // in PostgreSQL and removes the Salesforce record. The file sandbox is deleted on pass.
    });
  }
});
