/** API tests: auth, tenant isolation, POST/GET with schema checks, PostgreSQL cross-check (Example C). */
import { z } from 'zod';
import { test, expect } from '../../src/fixtures';
import { PatientSchema } from '../../src/schemas/appointment.schemas';
import { activeTenantId } from '../../src/config/ConfigManager';
import { readJson } from '../../src/data/sources/file.sources';
import * as path from 'path';

/**
 * EXAMPLE C: dedicated API test.
 * Authenticates, POSTs dynamic data, validates status + response schema (zod), GETs it back,
 * and cross-checks the persisted row in PostgreSQL. Data-driven from data/json/api-patients.json.
 */
const ApiCaseSchema = z.array(z.object({ caseId: z.string(), insuranceCode: z.string(), expectStatus: z.number(), note: z.string().optional() }));
const ApiCasesByTenant = z.record(z.union([ApiCaseSchema, z.string()]));
const ApiRequestDataSchema = z.object({
  headers: z.object({
    unauthenticated: z.record(z.string()),
    tenantScoped: z.record(z.string()),
  }),
  bodies: z.object({
    createPatient: z.record(z.string()),
  }),
});
const requestData = ApiRequestDataSchema.parse(readJson(
  path.resolve(__dirname, '../../data/json/api-patient-requests.json'),
));

function renderTemplate(template: Record<string, string>, values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(template).map(([key, value]) => [
    key,
    value.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
      const replacement = values[name];
      if (replacement === undefined) throw new Error(`No value provided for API request template field "${name}"`);
      return replacement;
    }),
  ]));
}

test.describe('Patients API @api', () => {
  test('rejects requests without a valid token', async ({ request, config }) => {
    // Playwright's built-in `request` fixture: raw, unauthenticated APIRequestContext.
    const res = await request.get(`${config.api!.baseUrl}/api/facilities`, {
      headers: requestData.headers.unauthenticated,
    });
    expect(res.status()).toBe(401);
  });

  test('a token cannot be used for another tenant', async ({ request, config, apiToken }) => {
    const other = config.tenant.id === 'acme' ? 'globex' : 'acme';
    const res = await request.get(`${config.api!.baseUrl}/api/facilities`, {
      headers: renderTemplate(requestData.headers.tenantScoped, { token: apiToken, tenant: other }),
    });
    expect(res.status()).toBe(401);
  });

  // Data-driven, per tenant: one test per JSON row of the ACTIVE tenant (read at collection time so titles are stable).
  const tenant = activeTenantId();
  const cases = ApiCaseSchema.parse(ApiCasesByTenant.parse(require('../../data/json/api-patients.json'))[tenant] ?? []);
  for (const c of cases) {
    test(`${c.caseId}: create patient with ${c.insuranceCode} → ${c.expectStatus} @mutating`, async ({ api, apiToken, db, config, testData, cleanup }) => {
      const fullName = `API Patient ${testData.uniqueTag()}`;
      const headers = renderTemplate(requestData.headers.tenantScoped, { token: apiToken, tenant: config.tenant.id });
      const body = renderTemplate(requestData.bodies.createPatient, { fullName, insuranceCode: c.insuranceCode });

      const created = await test.step('POST /api/patients', () =>
        api.post('/api/patients', { data: body, headers, expectStatus: c.expectStatus }));

      if (c.expectStatus !== 201) {
        expect(created.body).toMatchObject({ error: expect.stringContaining(c.insuranceCode) });
        const count = await db.scalar<string>('SELECT count(*) FROM patients WHERE full_name = $1', [fullName]);
        expect(Number(count), 'rejected request must not persist anything').toBe(0);
        return;
      }

      const patient = PatientSchema.parse(created.body);  // contract check (throws with field-level detail)
      cleanup.add(`delete patient ${patient.mrn}`, () => api.delete(`/api/patients/${patient.mrn}`, { headers, expectStatus: 204 }));
      expect(patient).toMatchObject({ fullName, insuranceCode: c.insuranceCode, tenantId: config.tenant.id });

      await test.step('GET /api/patients/:mrn returns the same record', async () => {
        const fetched = await api.get(`/api/patients/${patient.mrn}`, { headers, expectStatus: 200, schema: PatientSchema });
        expect(fetched.body).toEqual(patient);
      });

      await test.step('PostgreSQL cross-check', async () => {
        const row = await db.one<{ full_name: string; insurance_code: string; tenant_id: string }>(
          'SELECT full_name, insurance_code, tenant_id FROM patients WHERE mrn = $1', [patient.mrn]);
        expect(row).toEqual({ full_name: fullName, insurance_code: c.insuranceCode, tenant_id: config.tenant.id });
      });
    });
  }
});
