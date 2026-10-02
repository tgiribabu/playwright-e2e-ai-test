# Glossary
- **Tenant**: an isolated customer org (e.g. `acme`, `globex`); selected with `TENANT`, scopes API tokens, DB rows and Salesforce data.
- **Environment**: `local | qa | stage | prod | cura`; selected with `TEST_ENV`; defined in `config/environments/`.
- **LocatorDef / LocatorMap**: data describing how to find an element; lives in `*.locators.ts`.
- **SmartLocator**: runtime wrapper that resolves a LocatorDef with fallbacks (self-healing) and reports heals.
- **Heal**: the primary strategy failed and a fallback matched; recorded in `test-results/self-heal-report.json`.
- **Health gate**: the `health` project; every other project depends on it.
- **@mutating**: tag for tests that change data; excluded where `readOnly: true`.
- **Source of truth**: PostgreSQL / Salesforce state that UI results are verified against.
- **Demo app**: `demo-app/`, a local system under test (UI, API, exports, Salesforce mock) on PostgreSQL.
