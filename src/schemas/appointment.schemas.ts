/** zod contracts for the appointments domain: API responses and test-data rows. */
import { z } from 'zod';

/** API contracts (responses) for the appointments domain. Tests validate every response against these. */
export const PatientSchema = z.object({
  id: z.number().int(),
  mrn: z.string().regex(/^MRN-[0-9A-F]{8}$/),
  fullName: z.string().min(1),
  insuranceCode: z.string(),
  tenantId: z.string(),
  createdAt: z.string().datetime({ offset: true }),
});
export type Patient = z.infer<typeof PatientSchema>;

export const AppointmentCreatedSchema = z.object({
  reference: z.string().regex(/^APT-[0-9A-F]{6}$/),
  status: z.literal('SCHEDULED'),
  patientMrn: z.string(),
  facilityCode: z.string(),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const FacilitySchema = z.object({ id: z.string(), code: z.string(), name: z.string() });
export const FacilityListSchema = z.array(FacilitySchema);

/** Test data contracts (Excel / JSON / DB / Salesforce rows). */
export const AppointmentCaseRowSchema = z.object({
  TC_ID: z.string(),
  Facility_Code: z.string(),
  Insurance_Code: z.string(),
  Visit_In_Days: z.coerce.number().int().min(0),
  Comment: z.string().nullable().transform((v) => v ?? ''),
  Expected_Status: z.string(),
});

export const ExportExpectationsSchema = z.object({
  csvColumns: z.array(z.string()),
  maxFileBytes: z.number().int().positive(),
  patientNamePattern: z.string(),
});

export const InsurancePlanRowSchema = z.object({ code: z.string(), name: z.string(), active: z.boolean() });
export const FacilityRecordSchema = z.object({ Id: z.string(), Name: z.string(), Code__c: z.string() });
