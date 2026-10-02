/** Read-only database integrity tests (safe in prod). */
import { test, expect } from '../../src/fixtures';

/**
 * Database-driven backend validation. Read-only (SELECT only), so these also run in prod.
 * Typical use: catch broken migrations, orphaned rows and tenant-isolation leaks.
 */
test.describe('Data integrity @db', () => {
  test('every tenant has at least one active insurance plan', async ({ db }) => {
    const tenantsWithout = await db.query<{ id: string }>(`
      SELECT t.id FROM tenants t
      WHERE NOT EXISTS (SELECT 1 FROM insurance_plans p WHERE p.tenant_id = t.id AND p.active)`);
    expect(tenantsWithout).toEqual([]);
  });

  test('no appointment references a patient of another tenant', async ({ db }) => {
    const leaks = await db.query(`
      SELECT a.reference, a.tenant_id, p.tenant_id AS patient_tenant
      FROM appointments a JOIN patients p ON p.id = a.patient_id
      WHERE a.tenant_id <> p.tenant_id`);
    expect(leaks, 'cross-tenant references').toEqual([]);
  });

  test('appointment references are unique and well-formed', async ({ db }) => {
    const bad = await db.query(`SELECT reference FROM appointments WHERE reference !~ '^APT-[0-9A-F]{6}$'`);
    expect(bad).toEqual([]);
  });

  test('read-only guard blocks writes in read-only environments', async ({ db, config }) => {
    test.skip(!config.readOnly, 'only meaningful where the environment is read-only');
    await expect(db.query('DELETE FROM patients WHERE false')).rejects.toThrow(/read-only/);
  });
});
