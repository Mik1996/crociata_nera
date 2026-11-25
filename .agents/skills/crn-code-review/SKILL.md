---
name: crn-code-review
description: Professional review of Crociata Nera code (a diff, a branch, a PR or given files) against the project's architecture, conventions, security model and test rules, with findings ranked by severity and each tied to file, line, reason and fix. Use when the user asks to review, check or audit changes before a commit, a PR to master or a merge, or asks "is this ok?" about code just written.
argument-hint: "[PR number | branch | path]  (default: uncommitted changes + develop vs master)"
---

# Code review

Review what changed, judged against what this project already decided (`AGENTS.md`). Report in
English; quote code and identifiers as they are.

## 1. Scope

- Default: `git status`, `git diff` (uncommitted) and `git diff master...HEAD` (branch).
- PR: `gh pr diff <n>` and `gh pr view <n>`; branch: `git diff master...<branch>`; path: those files.
- Read each changed file **in full** where the change sits, plus the callers/callees it affects
  (grep the changed symbols). A diff alone hides broken callers.
- Note which areas are touched (backend route, model, scheduler, frontend page, styles, i18n, deploy) —
  it decides which checks below apply.

## 2. Checks

Correctness and regressions
- Logic errors, off-by-one in periods/seasons, time zones (months in Europe/Rome, CoC dates in UTC via
  `lib/coc/coc-date.ts`), null/undefined from the CoC API, main clan vs sister clans (`periodSuffix`).
- Idempotence: sync, awards, records, selections and migrations must be safe to run twice; frozen
  data (closed periods, published announcements, closed selections) must not be recomputed.
- Rules duplicated on purpose must stay equal: commendation rules (`backend/src/modules/commendations/commendation-rules.ts`
  ↔ `src/app/core/utils/commendations.ts`), ranking order (`modules/wars/history.service.ts` ↔
  `core/utils/monthly-history.ts`), clan castle capacity (`modules/bases/clan-castle.ts` ↔
  `core/game/clan-castle.ts`), layout links (`modules/bases/layout-link.ts` ↔ `core/game/layout-link.ts`),
  announcement colours (`image/announcement-theme.ts` ↔ `--cn-pdf-*`, enforced by a test).
- Mock mode: a new `CocApiService`/`DefenseBasesService`/`CwlSelectionService` method implemented in the
  `Mock…` class too.

Security and access (see `crn-access-control` for the model)
- Every route has the right `apiHandler` option (`clanAccess`, `leaderAccess`, `roles`, `auth`) and its
  OpenAPI `access` matches. Ownership checks on user content (proposals: author only).
- Input validated with zod (`parseBody`/`parseQuery`/`validate`), path params included; no raw
  `request.json()` in a handler.
- No secret, token, email or connection string logged or returned; `select` on user queries.
- Mongo queries built from user input: no operator injection (values validated as strings/enums).
- Frontend: no `innerHTML`/`bypassSecurityTrust*` with backend data; private GETs not added to a
  service-worker group that survives sign-out.
- CSP: inline script edits in `src/index.html` or the Swagger page need the hash updated in `deploy/Caddyfile`.
Report a vulnerability only with the concrete path that exploits it; otherwise call it a hardening
suggestion, not a bug.

Contracts and errors
- `BaseResult` envelope; errors are `MessageKey` values with translations in all three
  `public/i18n/*.json`; status codes coherent with the OpenAPI document (`backend/src/openapi/`).
- CoC API failures go through `fromCocApi` (502 `COC_API_UNAVAILABLE`); no swallowed errors; scheduler
  steps fail alone without stopping the run.
- `ApiName` + `RATE_LIMITS` for every new route.

Type safety
- No `any`/`as` casts hiding a wrong shape where a type or zod output exists; no non-null `!` on data
  that can be missing.

Performance
- Queries: an index for each new filter/sort on a growing collection; no N+1 loops of `findOne`;
  `.lean()` for read-only data. Tables are built in memory (`queryTable`): fine for clan-sized data, flag
  anything that loads unbounded history per request.
- CoC API calls: use `live-coc.ts` caches; no extra calls per request per member.
- Frontend: `OnPush` + signals, no subscriptions without cleanup, lazy chunks for heavy libraries
  (pdfmake, pdf.js, three) only on use.

Conventions (`AGENTS.md`)
- Separate `.ts/.html/.scss`, `crn` prefix, colours only from the palette, rem + spacing tokens, no
  `::ng-deep`/`!important`, container queries, `<crn-load-state>`, `<crn-icon>`, i18n in three files, English
  code/comments, doc comments on exported symbols.

Tests (see `crn-testing-strategy`)
- New behaviour and every fixed bug have a test; backend responses go through `call()` so the contract is
  checked; tests assert behaviour, not implementation details; no `.only`/`.skip` left.

Duplication and complexity
- A helper or component that already exists (`crn-frontend-ui` lists them); new abstractions used once;
  functions doing several things; dead code left behind.

## 3. Verify before reporting

For each finding, re-read the code and confirm it is real (try the input, find the caller, run the test
when cheap). Drop what you cannot substantiate or mark it **Da verificare** with what is missing.
Optionally run the checks (`AGENTS.md` "Commands") and report their outcome.

## 4. Report

Group by severity, most severe first:

- **Critico** — data loss/corruption, security hole with a concrete path, production break, deploy blocker.
- **Alto** — wrong behaviour users will hit, broken contract/access rule, missing migration.
- **Medio** — edge case, missing test for new logic, convention break with consequences (CI lint, mock mode).
- **Basso** — readability, naming, minor duplication.
- **Nit** — style preferences (only if few).

Each finding: `path:line` — what is wrong — why it matters (scenario) — suggested fix (short, concrete).
End with a one-line verdict (pronto / pronto con modifiche / da rivedere) and what was not checked.
Do not apply fixes unless the user asks.
