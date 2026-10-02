/** Demo app UI tests: dropdown vs Salesforce, validation, create + table check. */
import { test, expect } from '../../../src/fixtures';
import { FacilityListSchema, PatientSchema } from '../../../src/schemas/appointment.schemas';
import { soql } from '../../../src/clients/salesforce/SoqlClient';

/** UI E2E tests for the demo app. Tests talk to page objects only: no selectors here (see docs/LOCATOR-STANDARD.md). */
test.describe('Appointments UI @ui', () => {
  test.beforeEach(async ({ loginPage, appointmentsPage, config }) => {
    test.skip(!config.api, 'demo-app environments only');
    await loginPage.open();
    await loginPage.login(config.ui.credentials!.username, config.ui.credentials!.password, config.tenant.id);
    await appointmentsPage.expectLoaded(config.tenant.displayName);
  });

  test('facility dropdown lists exactly the active Salesforce facilities for the tenant', async ({ appointmentsPage, sf, config }) => {
    const records = await sf.query<{ Name: string }>(soql`SELECT Name FROM Facility__c WHERE Tenant__c = ${config.tenant.id} AND Active__c = true`);
    const options = await appointmentsPage.facilityOptions();
    expect([...options].sort()).toEqual(records.map((r) => r.Name).sort());
  });

  test('unknown patient MRN is rejected with a validation message', async ({ appointmentsPage, api }) => {
    const [facility] = (await api.get('/api/facilities', { expectStatus: 200, schema: FacilityListSchema })).body;
    const error = await appointmentsPage.submitExpectingError({ patientMrn: 'MRN-00000000', facilityName: facility!.name, visitDate: '2030-01-01' });
    expect(error).toContain('Unknown patient MRN');
  });

  test('appointment created in the UI appears in the table @mutating', async ({ appointmentsPage, api, db, config, testData, cleanup }) => {
    // Tenant-agnostic: take any active plan of the CURRENT tenant instead of hard-coding one.
    const insuranceCode = await db.scalar<string>('SELECT code FROM insurance_plans WHERE tenant_id = $1 AND active ORDER BY code LIMIT 1', [config.tenant.id]);
    const patient = PatientSchema.parse((await api.post('/api/patients', {
      data: { fullName: `UI Patient ${testData.uniqueTag()}`, insuranceCode }, expectStatus: 201,
    })).body);
    cleanup.add('delete patient', () => api.delete(`/api/patients/${patient.mrn}`));
    const [facility] = (await api.get('/api/facilities', { schema: FacilityListSchema })).body;

    const reference = await appointmentsPage.createAppointment({ patientMrn: patient.mrn, facilityName: facility!.name, visitDate: '2030-02-03', comment: 'UI test' });

    await appointmentsPage.table.expectRow({ Reference: reference, 'Patient MRN': patient.mrn, Facility: facility!.name, Status: 'SCHEDULED' });
  });
});

test('wrong password shows an error @ui', async ({ loginPage, config }) => {
  test.skip(!config.api, 'demo-app environments only');
  await loginPage.open();
  await loginPage.login(config.ui.credentials!.username, 'definitely-wrong', config.tenant.id);
  await loginPage.expectError('Invalid username or password');
});
