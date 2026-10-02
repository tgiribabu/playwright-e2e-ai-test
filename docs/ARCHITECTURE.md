# Architecture guide

A multi-tenant Playwright + TypeScript framework for UI, API, PostgreSQL, Salesforce (SOQL), files and
multi-source test data, with self-healing locators and a parallel device matrix. Every layer is exercised
by runnable tests against the bundled demo stack (`demo-app/`), so the patterns below are verified, not theoretical.

## 1. Folder structure

```
config/
  environments/<env>.json   non-secret params per env (local, qa, stage, prod, cura) + tenants
  devices.ts                device matrix (desktop / mobile / tablet groups)
src/
  config/                   env.schema.ts (zod) · ConfigManager.ts · secrets.ts · HealthCheck.ts
  core/
    logger.ts               one line per message, secrets masked
    locators/               locator.types.ts · SmartLocator.ts (self-healing) · bindLocators.ts
  clients/
    api/ApiClient.ts        typed APIRequestContext wrapper + auth
    db/PostgresClient.ts    pooled, parameterized, read-only guard
    salesforce/             SalesforceTokenManager.ts (JWT / client credentials) · SoqlClient.ts
  schemas/                  zod contracts: API responses and test-data rows
  data/
    sources/                excel.source.ts · file.sources.ts (json, csv)
    TestDataProvider.ts     one entry point: excel/json/csv/db/soql/api, validated
    builders/               multi-source builders (e.g. appointment-case.builder.ts)
  files/                    FileValidator.ts (magic-byte MIME, structure) · SecureFileSystem.ts (sandbox)
  ui/
    components/<widget>/    <widget>.component.ts + <widget>.locators.ts (DataTable, Modal, Dropdown, Toast)
    pages/<app>/            <page>.page.ts + <page>.locators.ts
  fixtures/                 config → clients → data / files / ui  →  index.ts (the `test` object)
  reporters/                self-heal.reporter.ts
tests/
  setup/health.setup.ts     environment health gate (runs before everything)
  api/  db/  ui/<app>/  showcase/   test layers, separated
  unit/                     framework self-tests (no environment)
data/{excel,json,csv}/      test data
demo-app/                   local system under test: UI + REST API + exports + Salesforce mock, on PostgreSQL
scripts/                    lint-locators.mjs · ai/sync.mjs · ai/context-pack.mjs · make-sample-excel.ts
docs/                       this guide · LOCATOR-STANDARD.md · REVIEW.md
AGENTS.md                   rules for every AI tool (hand-written, token-budgeted)
ai/                         AI source of truth: rules/, playbooks/, context/, manifest.json → generated tool files
CLAUDE.md GEMINI.md llms.txt .github/{instructions,prompts} .claude/ .gemini/ .cursor/ .continue/ .clinerules/ .aider*   (GENERATED)
```

### Why this layout is AI-friendly (Copilot, Claude, Gemini, Cursor, local Llama…)
- **One concept per file, predictable names** (`<name>.page.ts` + `<name>.locators.ts`, `*.api.spec.ts`): any model finds or
  creates the right file from the task wording.
- **Line 1 of every file states its purpose** → generated `ai/context/repo-map.md`: the whole repo in a few hundred tokens.
- **Data separated from behaviour** (locator files, env JSON, test data): cheap to read and diff.
- **Layered context, one source:** a small always-on `AGENTS.md` (token-budgeted), path-scoped rule packs and task playbooks in
  `ai/`, generated into each tool's native format (`npm run ai:sync`; CI fails on drift). See `ai/README.md` for the tool matrix.
- **Small-context models:** `npm run ai:context -- "<task>"` builds a task-specific pack within a token budget.
- **Types and checks as guardrails:** `LocatorMap`, zod schemas, locator lint, `ai:check` and self-tests let any model verify its output.

## 2. Layers

### Multi-environment config and secrets (`src/config/`)
- `config/environments/<env>.json`: URLs, DB host, Salesforce settings, tenants and per-tenant `overrides`
  (deep-merged). Validated by `env.schema.ts` at load time, so a typo fails with the file, field and reason.
- Secrets are referenced by **name**. `resolveSecret("DB_PASSWORD")` with `TEST_ENV=qa TENANT=acme` reads
  `QA_ACME_DB_PASSWORD`, then `QA_DB_PASSWORD`, then `DB_PASSWORD` from the environment (`.env.<env>` / `.env`, CI secrets).
- `getConfig()` returns a frozen `AppConfig`; `safeSummary()` masks secrets for logs/reports. The logger masks every
  resolved secret value automatically.
- **Production is read-only**: `readOnly: true` makes the API client refuse non-GET requests, the DB client refuse
  non-SELECT statements, and the config exclude `@mutating` tests.

### Environment health validator (`src/config/HealthCheck.ts`, `tests/setup/health.setup.ts`)
Runs once as the `health` project that every other project depends on. It checks the UI (HTTP), the API (health
endpoint + real authentication for the tenant), PostgreSQL (`SELECT version()`), and Salesforce (OAuth + limits,
warning at <5% API calls left). Unconfigured components are `SKIPPED`; a required component `DOWN` stops the
run with a status table instead of hundreds of red tests.

### Data providers (`src/data/`)
`testData.excel / excelCase / json / csv / db / soql / api`. Every reader takes a zod schema. Builders such as
`buildAppointmentCase()` combine sources into one typed object (**Example E**). Tenant-specific data is keyed
by tenant (`data/json/api-patients.json`).

### Connectors (`src/clients/`)
- **PostgreSQL:** pool per worker, `statement_timeout`, `application_name`, `$1` parameters only, `one/maybeOne/scalar`,
  `transaction`, `waitFor` (polling for async writes).
- **Salesforce:** JWT Bearer or Client Credentials, token de-duplicated and refreshed per worker; SOQL with pagination,
  re-auth on 401, `waitFor`, and the injection-safe `soql` tagged template.

### API testing layer (`src/clients/api/ApiClient.ts`)
Wraps Playwright's `APIRequestContext`: `expectStatus` (fails with the response body), zod `schema` (typed body),
tenant header and bearer token injected by the `api` fixture. Raw `request` remains available for negative auth tests.

### UI: page objects + reusable components (`src/ui/`)
Pages bind their locator file and compose components; components receive a root `Locator` and bind their own
locator file. See `docs/LOCATOR-STANDARD.md`.

### Self-healing locators (`src/core/locators/SmartLocator.ts`)
Primary strategy, then ordered fallbacks; one automatic re-resolve when the DOM re-renders mid-action. Every heal is
recorded on the test and summarised in `test-results/self-heal-report.json`. `HEALING_MODE=strict` turns heals into
failures (release gates); `off` disables fallbacks.

### Files (`src/files/`)
`validateFile()` checks name pattern, extension, **real MIME type from magic bytes** (catches spoofed and
executable files), size, and CSV/XLSX/JSON structure, and returns parsed rows. `SecureFileSystem` is a per-test
sandbox: no absolute paths, `..`, or symlink escapes; sanitized download names; extension allowlist; quota; atomic
writes; deleted on pass and kept on failure.

### Parallel execution and devices (`playwright.config.ts`, `config/devices.ts`)
`fullyParallel`, `workers: 50%` on CI, `DEVICES=` selects device groups or projects, API/DB tests run once in
the browser-less `api` project, `--shard=i/n` + blob reports merged in CI.

## 3. Example index (requirement → file)
| | Requirement | Where |
|---|---|---|
| A | Locator file + page object consuming it | `src/ui/pages/demo/login.locators.ts`, `login.page.ts` |
| B | Config manager + health validator | `src/config/ConfigManager.ts`, `HealthCheck.ts`, `tests/setup/health.setup.ts` |
| C | API test: auth, POST/GET, schema, PostgreSQL cross-check | `tests/api/patients.api.spec.ts` |
| D | Reusable component + page object using it | `src/ui/components/data-table/*`, `src/ui/pages/demo/appointments.page.ts` |
| E | Excel/JSON + PostgreSQL + SOQL data helper | `src/data/builders/appointment-case.builder.ts` |
| F | File validation + secure file system | `src/files/FileValidator.ts`, `SecureFileSystem.ts` |
| G | Self-healing locator wrapper | `src/core/locators/SmartLocator.ts` |
| H | Parallel / device-matrix config | `playwright.config.ts`, `config/devices.ts` |
| I | Master showcase test | `tests/showcase/master-showcase.spec.ts` |

## 4. How to extend
- **New environment:** add `config/environments/<env>.json`; add secrets as `<ENV>_<NAME>`; run `npm run health`.
- **New tenant:** add it under `tenants` (with `overrides` if URLs differ); tenant-specific secrets as `<ENV>_<TENANT>_<NAME>`.
- **New page:** `src/ui/pages/<app>/<name>.locators.ts` + `<name>.page.ts`, then register a fixture in `src/fixtures/ui.fixture.ts`.
- **New component:** `src/ui/components/<widget>/` with component + locators; export it from `components/index.ts`.
- **New API contract:** add a zod schema in `src/schemas/` and pass it as `schema:`.
- **New device:** add it to a group in `config/devices.ts`.
