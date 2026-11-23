---
name: crn-testing-strategy
description: How to decide, write and run tests in Crociata Nera with the tools already in place (Vitest for the Angular frontend via `ng test`, Vitest + in-memory MongoDB for the Next.js backend, the OpenAPI contract check, mocks of the Clash of Clans and Telegram APIs). Use when adding or changing behaviour, fixing a bug, reviewing test coverage, or when the user asks which tests are missing or why a test is flaky.
---

# Testing strategy

No new test dependency: everything below already exists. Keep tests in English, named after the
behaviour ("closes the selection when the CWL starts"), not after the method.

## 1. What needs a test

In order of value:
1. **Business rules** — commendations, ranking order, CWL selection score/statuses, donation counting,
   records, base proposal lifecycle, announcement drafts. Pure rule files are unit-tested directly
   (`cwl-selection.rules.ts`, `commendation-rules.ts`, `layout-link.ts`).
2. **Access rules** — every new route: 401 without token, 403 for the wrong level, 200 for the right one
   (`crn-access-control` lists the levels). Ownership (another user's proposal → 404).
3. **Idempotence / once-only** — run a sync twice, close a period twice, re-run a migration.
4. **Edges** — empty data, CoC API errors (`mockCocApi` returning 403/404/429/503), private war log,
   period boundaries (last day of month in Europe/Rome, Monday 05:00 UTC), sister clans (`@<tag>`
   periods), limits (`MAX_*` constants), invalid input (zod → `MessageKey`).
5. **Frontend** — what the page shows for data, empty, loading, error; user actions calling the service;
   mappers of the CoC format; i18n keys present.

Skip: getters, Angular/Material behaviour, re-testing a rule at every layer (test the rule once as a unit,
then one route test proving it is wired).

## 2. Backend (`backend/test/*.test.ts`)

- Setup is automatic (`test/setup.ts`): one in-memory MongoDB, collections emptied and indexes synced
  before each test, rate limits and caches reset, env set (`CLAN_TAG=#2J8JVVCLC`). Files run serially.
- Call route handlers through `call(handler, { body, token, cookie, params, ip, method, headers })`
  (`test/helpers.ts`): it builds the `Request` and **checks the response against the OpenAPI document**
  (`test/contract.ts`). Always go through `call()` for routes, so the contract stays enforced.
- Users: `memberToken(username)` (verified account in Crociata Nera); `seedCrusadeRosters(members, leaders)`
  for leaders/sister clans. Administrators: each file has a local `adminToken()` helper (e.g.
  `test/bases.test.ts`, `test/base-proposals.test.ts`, `test/announcements.test.ts`; `test/admin.test.ts`
  shows the `ADMIN_EMAILS` path) — reuse the one of the file you extend.
- External APIs: `mockCocApi({ '/currentwar': { body: cocWar() }, '/warlog': { status: 403, body: {…} } })`
  (`test/coc-mock.ts`: keys are path **suffixes**, values `{ status?, body }` or a function returning one;
  unknown paths answer 404; it returns the `fetch` mock to inspect calls). Telegram:
  `mockTelegramApi(handlers)` (`test/telegram-mock.ts`). Payload builders like `cocWar()` in `helpers.ts`.
- Time: `vi.useFakeTimers({ toFake: ['Date'] })` + `vi.setSystemTime(...)` for period logic.
- New route ⇒ `test/openapi.test.ts` fails until the operation is documented (that is intended).
- Run: `cd backend && npx vitest run test/<file>.test.ts` (one file), `npm test` (all), `npm run typecheck`.

## 3. Frontend (`src/**/*.spec.ts`)

- Vitest through the Angular builder; global providers in `src/test-providers.ts` (translations of the
  three languages, `src/app/testing/i18n.ts`).
- Data: `provideCocApiTest()` (`src/app/testing/fixtures.ts`) wires the **mock** services, so pages render
  deterministic demo data; fixture builders `sampleWar`, `member`, `participant`, `attack`.
  Demo data depends on today: fake `Date` only (`vi.useFakeTimers({ toFake: ['Date'] })`) so timers still
  settle (see `features/raids/raids-page.spec.ts`).
- HTTP services: `HttpTestingController` (see `core/api/http-coc-api.service.spec.ts`,
  `core/backend/auth.service.spec.ts`).
- Components: `TestBed.createComponent`, `await fixture.whenStable()`, query the DOM by classes/roles;
  assert texts in Italian (default test language) only when the text is the point.
- Admin publishing pages have shared helpers in `features/admin/publishing/publishing-testing.ts`.
- Run: `npx ng test --watch=false --include <spec>`; all: `npx ng test --watch=false`.

## 4. End-to-end

There is **no e2e framework** in the repo (no Playwright/Cypress). Do not add one without the user's
decision. End-to-end confidence comes from: backend route tests (real handler + DB + contract), page specs
with mock services, and a manual check in a real browser (`npm run start:mock`, or `npm start` +
`npm run backend` for signed-in pages; browser tools such as the Safari MCP can drive it). Say explicitly in
the report which flows were only checked by hand.

## 5. Reliability

- A test must fail for the bug it guards: when fixing a bug, run the new test on the unfixed code once.
- No real network, no real clock dependence, no order dependence between tests, no `setTimeout` waits.
- Assert outcomes (response, saved document, DOM) rather than calls of private functions.
- Avoid snapshot-style whole-object asserts on large payloads; `toMatchObject` on what matters.
- Do not leave `.only`, `.skip`, `console.log`.

## 6. Before saying done

Run the suites of the touched side(s); full set (as CI does) when shared code changed:
`cd backend && npm run typecheck && npm test`, `npx tsc -p tsconfig.app.json --noEmit`,
`npx ng test --watch=false`, `npm run lint:colors`, `npm run lint:units`. Report failures with their output.
