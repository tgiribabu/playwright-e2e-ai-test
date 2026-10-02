-- Demo application schema (multi-tenant). Applied idempotently on server start.
CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS insurance_plans (
  tenant_id TEXT NOT NULL REFERENCES tenants(id), code TEXT NOT NULL, name TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (tenant_id, code));
CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), mrn TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL, insurance_code TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY, reference TEXT NOT NULL UNIQUE, tenant_id TEXT NOT NULL REFERENCES tenants(id),
  patient_id INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE, facility_code TEXT NOT NULL,
  visit_date DATE NOT NULL, comment TEXT, status TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
-- Backing store for the Salesforce mock (object + JSON fields), queried via the mock SOQL endpoint.
CREATE TABLE IF NOT EXISTS sf_records (id TEXT PRIMARY KEY, object TEXT NOT NULL, fields JSONB NOT NULL);

INSERT INTO tenants VALUES ('acme','Acme Health'),('globex','Globex Clinics') ON CONFLICT DO NOTHING;
INSERT INTO insurance_plans VALUES
  ('acme','MEDICARE','Medicare',TRUE),('acme','MEDICAID','Medicaid',TRUE),('acme','LEGACY','Legacy plan',FALSE),
  ('globex','PRIVATE','Private cover',TRUE) ON CONFLICT DO NOTHING;
INSERT INTO sf_records VALUES
  ('a0F000000000001AAA','Facility__c','{"Name":"Tokyo CURA Healthcare Center","Code__c":"FAC-TKY","Tenant__c":"acme","Active__c":true}'),
  ('a0F000000000002AAA','Facility__c','{"Name":"Hongkong CURA Healthcare Center","Code__c":"FAC-HKG","Tenant__c":"acme","Active__c":true}'),
  ('a0F000000000003AAA','Facility__c','{"Name":"Seoul CURA Healthcare Center","Code__c":"FAC-SEL","Tenant__c":"acme","Active__c":true}'),
  ('a0F000000000004AAA','Facility__c','{"Name":"Globex Downtown Clinic","Code__c":"FAC-DTN","Tenant__c":"globex","Active__c":true}')
  ON CONFLICT DO NOTHING;
