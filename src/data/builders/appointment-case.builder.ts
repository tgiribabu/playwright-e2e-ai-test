/** Builds an appointment test case from Excel + JSON + PostgreSQL + Salesforce (Example E). */
import { z } from 'zod';
import type { TestDataProvider } from '../TestDataProvider';
import { soql } from '../../clients/salesforce/SoqlClient';
import {
  AppointmentCaseRowSchema, ExportExpectationsSchema, FacilityRecordSchema, InsurancePlanRowSchema,
} from '../../schemas/appointment.schemas';

/** Everything a booking test needs, assembled from four sources and validated. */
export interface AppointmentCase {
  tcId: string;
  patientName: string;
  insurance: z.infer<typeof InsurancePlanRowSchema>;   // PostgreSQL
  facility: z.infer<typeof FacilityRecordSchema>;      // Salesforce
  visitDate: string;                                   // Excel (offset) → ISO date
  comment: string;                                     // Excel
  expectedStatus: string;                              // Excel
  exportRules: z.infer<typeof ExportExpectationsSchema>; // JSON
}

/**
 * EXAMPLE E: multi-source data helper.
 *   Excel  → test-case parameters (facility code, insurance code, offsets, expected status)
 *   JSON   → environment-independent expectations (export columns, size limits, naming pattern)
 *   Postgres → the live insurance plan row (must exist and be active for the tenant)
 *   Salesforce → the live facility record (Id + display name used in the UI)
 */
export async function buildAppointmentCase(data: TestDataProvider, tcId: string, tenantId: string): Promise<AppointmentCase> {
  const row = await data.excelCase('excel/appointment-cases.xlsx', tcId, AppointmentCaseRowSchema);
  const exportRules = data.json('json/export-expectations.json', ExportExpectationsSchema);

  const [insurance] = await data.db(
    'SELECT code, name, active FROM insurance_plans WHERE tenant_id = $1 AND code = $2',
    [tenantId, row.Insurance_Code],
    InsurancePlanRowSchema,
  );
  if (!insurance?.active) throw new Error(`[${tcId}] insurance plan ${row.Insurance_Code} missing or inactive for ${tenantId}`);

  const [facility] = await data.soql(
    soql`SELECT Id, Name, Code__c FROM Facility__c WHERE Code__c = ${row.Facility_Code} AND Tenant__c = ${tenantId}`,
    FacilityRecordSchema,
  );
  if (!facility) throw new Error(`[${tcId}] facility ${row.Facility_Code} not found in Salesforce for ${tenantId}`);

  const visit = new Date();
  visit.setDate(visit.getDate() + row.Visit_In_Days);

  return {
    tcId,
    patientName: exportRules.patientNamePattern.replace('{tag}', data.uniqueTag('PT')),
    insurance,
    facility,
    visitDate: visit.toISOString().slice(0, 10),
    comment: row.Comment,
    expectedStatus: row.Expected_Status,
    exportRules,
  };
}
