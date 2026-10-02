# playwright-e2e-test

Multi-tenant Playwright + TypeScript test framework: UI (page objects, reusable components, self-healing
locators), API (APIRequestContext + zod contracts), PostgreSQL, Salesforce SOQL, Excel/JSON/CSV/DB/API test data,
file validation, environment health checks, and a parallel multi-device matrix.

**Start here:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/LOCATOR-STANDARD.md`](docs/LOCATOR-STANDARD.md) ·
[`docs/REVIEW.md`](docs/REVIEW.md) (findings from the previous version) · [`AGENTS.md`](AGENTS.md) (rules for AI assistants) · [`ai/README.md`](ai/README.md) (Copilot, Claude, Gemini, Cursor, Continue/Llama, Cline, Aider)

## Quick start (local demo stack)
```bash
npm ci
npx playwright install --with-deps chromium
cp .env.example .env
npm run verify                     # typecheck + locator lint + framework self-tests (no env needed)

# PostgreSQL 16 for the demo stack (pick one)
docker run -d --name pw-pg -p 5432:5432 -e POSTGRES_USER=qa_app -e POSTGRES_PASSWORD=localdev -e POSTGRES_DB=appdb postgres:16
#   or macOS: brew install postgresql@16 && brew services start postgresql@16 &&
#             psql postgres -c "CREATE USER qa_app PASSWORD 'localdev'" -c "CREATE DATABASE appdb OWNER qa_app"

npm run demo:up                    # terminal 1: http://localhost:4400 (UI, API, exports, Salesforce mock)
npm run test:showcase              # terminal 2: health check + master end-to-end test
npm test                           # everything for the selected DEVICES (default: chromium)
```

## Common commands
| Command | What it does |
|---|---|
| `TEST_ENV=qa TENANT=globex npm test` | run against another environment / tenant |
| `DEVICES=desktop,mobile npm test` | Chromium, Firefox, WebKit, Pixel 7, iPhone 14 in parallel |
| `npx playwright test --shard=1/4` | one CI shard |
| `npm run health` | environment health table only |
| `npm run test:api` | API + DB tests (no browser) |
| `npm run test:cura` | the original CURA demo-site tests, ported |
| `HEALING_MODE=strict npm test` | fail on any self-healed locator |
| `DEMO_DRIFT=1 npm run demo:up` | rename test ids in the demo app to watch self-healing work |
| `npm run report` / `npm run allure` | HTML / Allure report |
| `npm run ai:context -- "<task>"` | context pack for any chat UI / local model (`ai/out/context.md`) |
| `npm run ai:sync` / `ai:check` | regenerate / verify all AI-tool files from `ai/` |
