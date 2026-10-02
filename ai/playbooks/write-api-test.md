# Playbook: write an API test
1. Add/extend the response contract in `src/schemas/<domain>.schemas.ts` (zod).
2. Create `tests/api/<resource>.api.spec.ts`; use the `api` fixture (authenticated, tenant-scoped) and raw `request` for negative auth cases.
3. Every call: `expectStatus` + `schema`. Generate unique data with `testData.uniqueTag()`; register `cleanup` for created resources.
4. Cross-check persistence with `db.one('… WHERE id = $1', [id])` and, for rejected requests, assert nothing was written.
5. Data-driven cases: tenant-keyed JSON in `data/json/`, validated with zod at collection time.
6. Tag `@api` (+ `@mutating`). Verify with `npm run test:api`.
Reference: `tests/api/patients.api.spec.ts`.
