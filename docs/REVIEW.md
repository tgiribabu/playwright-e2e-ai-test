# Review of the original repository and migration map

Scope: every source file in the uploaded `playwright-e2e-test` (reports, `.git` and `node_modules` excluded).
Measured baseline: the new locator linter reports **53 violations in 3 original spec files**; the refactored code has 0.

## Critical: act on these first
| # | Finding | Why it matters | Action |
|---|---|---|---|
| 1 | `data/employees.xlsx` contains what appear to be **real Oracle Cloud HCM credentials**: a dev tenant URL, a username, and a password stored as Base64 | Base64 is an encoding, not encryption: anyone with the file can read the password. `.xlsx` is not git-ignored, so it is likely in the git history (and in this zip) | **Rotate that password now.** Remove the file from history (`git filter-repo --path data/employees.xlsx --invert-paths`), force-push, and ask collaborators to re-clone. The refactor does not ship this file |
| 2 | `.env` was included in the shared archive | It is git-ignored (good) but was still distributed | Treat its values as exposed; rotate if real |
| 3 | `tests/demo/mobile.spec.ts` is an IIFE that launches WebKit on import | The runner imports `*.spec.ts` during collection, so **every run launches a stray browser** outside Playwright's control; it also requires the `playwright` package, which is not a dependency | Removed; mobile coverage is now the `mobile-chrome` / `mobile-safari` projects |

## High
| # | Finding | Refactor |
|---|---|---|
| 4 | Tests that cannot fail: `getele.count.spec.ts` only `console.log`s; "Should check invalid flow" has no assertion | Every ported test asserts an outcome (`expectLoginFailed`, `expectConfirmed`, table/DB/SOQL checks) |
| 5 | Selectors inline and duplicated (`getByRole('textbox', { name: 'Visit Date (Required)' })` three times per test); `tests/page-objects/` empty | Locator files + page objects + lint enforcement |
| 6 | Credentials hard-coded in specs; `codegen.test.ts` prints `TEST_USER_NAME`; `file-helper.ts` logs the whole data file | Secrets resolved by name, masked in logs; no data dumps |
| 7 | `config/dev.playwright.config.ts` and `test.playwright.config.ts` are identical (dev says `envName: "test"`); env options declared via `test1` fixture but never used (tests read `testInfo.project.use as any`) | One config + `TEST_ENV`/`TENANT`, schema-validated env files, typed `config` fixture |
| 8 | `workers: process.env.CI ? 1 : undefined` | CI ran fully serial; now `50%` workers + 4 shards |
| 9 | CI: `copilot-setup-steps.yml` runs `npx run build` (invalid); `playwright.yml` has no secrets, sharding or report merge | Fixed workflow with `verify` gate, Postgres service, sharding and merged report |
| 10 | Data-driven test ignores CSV `visitDt`/`hcp`; `employee.spec.ts` (commented out) calls an async reader at module load without `await` | CSV rows validated with zod; every column used; async data read inside tests/builders |

## Medium / hygiene
| # | Finding | Refactor |
|---|---|---|
| 11 | Logger prints each line three times and creates a `test.step` per log line (and throws outside tests) | `createLogger()`: one line, levels, secret masking |
| 12 | `playwright.config.ts` imports unused `node:http` `Server` and `node:test` `suite` | Removed |
| 13 | No `tsconfig.json`; `@types/node` 25 vs Node 24 LTS; `chalk` only used by the logger | `tsconfig` (strict), aligned types, `chalk` dropped |
| 14 | Personal files committed: `.bash_profile`, absolute nvm paths in `.vscode/settings.json` | Removed; portable workspace settings + recommended extensions |
| 15 | Learning scratch inside `tests/` (`type.ts`, `tryouts/*.mts`, commented-out utilities) | Not migrated (keep them in a separate `playground/` repo if useful) |
| 16 | `employees.xlsx` had ~90 empty trailing columns | Excel reader ignores blank headers; sample workbook generated from code (`npm run data:sample-excel`) |
| 17 | `.env.examples` empty and misnamed (dotenv tooling expects `.env.example`) | Documented `.env.example` |
| 18 | Allure option `open: "always"` (ignored by allure-playwright; would block CI if honoured) | Allure kept with environment info; open it with `npm run allure` |
| 19 | Generated Copilot healer agent tells the AI to change expected values and mark tests `test.fixme()` | Patched with project overrides (re-apply after `playwright init-agents`) |

## Migration map
| Original | New |
|---|---|
| `tests/demo/login.spec.ts`, `tests/demo/locators.spec.ts` | `tests/ui/cura/appointment-booking.spec.ts` + `src/ui/pages/cura/*` |
| `data/dev/emp.csv` | `data/csv/cura-bookings.csv` (validated with zod) |
| `tests/helpers/file-helper.ts` | `src/data/sources/file.sources.ts` (`readCsv`, `readJson`) |
| `tests/utilities/excelUtil.ts` (commented out) | `src/data/sources/excel.source.ts` |
| `tests/helpers/config-fixtures.ts`, `config/*.playwright.config.ts` | `config/environments/*.json` + `src/config/ConfigManager.ts` + `src/fixtures/config.fixture.ts` |
| `tests/helpers/global-setup.ts` (not wired) | `tests/setup/health.setup.ts` (project dependency) |
| `tests/helpers/logger.ts` | `src/core/logger.ts` |
| `tests/demo/mobile.spec.ts` | `config/devices.ts` (`DEVICES=mobile`) |
| `.github/agents/*`, `.vscode/mcp.json` | kept (healer patched) + `AGENTS.md`, `.github/copilot-instructions.md`, `.github/instructions/` |
| `references/*.md` (setup notes) | not migrated; still valid learning notes, unrelated to the framework |
