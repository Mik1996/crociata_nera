---
name: crn-bug-investigation
description: Procedure to investigate and fix a defect in Crociata Nera — reproduce it, gather logs, find the root cause across frontend, backend, scheduler, CoC API and MongoDB, fix it narrowly and add a regression test. Use when the user reports something wrong, broken, missing, slow or inconsistent on the site (wrong numbers in a table, a page that never loads, a sign-out loop, a draft not created, a Telegram post not sent, a failing test or CI job).
---

# Bug investigation

Goal: fix the **cause**, prove it with a test that failed before the fix, and change nothing else.
Talk to the user in English.

## 1. Pin down the symptom

Write down, before reading code: what is seen, what was expected, where (page/route, environment:
local, mock, production), who (role: guest, user, clan member, leader, admin; which clan), since when
(after which commit or deploy: `git log --oneline -20`, `git log -S '<symbol>'`).
If the report is vague, ask for the URL, a screenshot or the time it happened — one question, not a list.

## 2. Reproduce

Pick the cheapest faithful reproduction:

| Where it shows | How to reproduce |
|---|---|
| Rule/computation in the backend | A failing Vitest test calling the route with `call()` (`backend/test/helpers.ts`) and the CoC API faked with `mockCocApi` (`backend/test/coc-mock.ts`), Telegram with `mockTelegramApi`. This is usually also the regression test. |
| Frontend logic or rendering | A failing spec (`npx ng test --watch=false --include <spec>`) with `provideCocApiTest()` (`src/app/testing/fixtures.ts`); fake only `Date` when it depends on today (`vi.useFakeTimers({ toFake: ['Date'] })`). |
| Visual / layout | `npm run start:mock` + a browser (public and mock-able pages). Pages needing a session cannot be seen in mock mode: ask the user to check with `npm start` + `npm run backend`. |
| Only with real data | Local backend on the `dev` database (`backend/.env.local`); `crn-copy-prod-to-dev` skill to get production's state (plan first). Never point the local backend at `Prod`. |
| Only in production | Ask the user to run commands on the VPS (Claude cannot SSH): `docker compose logs --since 1h backend` in `~/crociata_nera/deploy`; give the exact command. |

If it does not reproduce, say so and list what was tried; do not "fix" a guess.

## 3. Collect evidence

- **Backend logs** use bracketed prefixes: `[api]`, `[auth]`, `[war-sync]`, `[telegram]`, `[migrations]`…
  (`grep -rn "console.error('\[" backend/src` lists them). Unhandled errors are logged by
  `respondWithError` in `backend/src/lib/http/api-handler.ts` and reach the client as `ERROR.UNHANDLED_ERROR`.
- **Response envelope**: every API answer is `{ result, messages, status }`; the `messages[].key` tells
  which branch failed (`backend/src/lib/http/message-key.ts`). 502 `COC_API_UNAVAILABLE` = Clash of Clans
  API (see the table "Casi particolari" in README), 503 = MongoDB unreachable, 429 = rate limit
  (`api-name.ts`), 403 `CLAN_ACCESS_REQUIRED`/`LEADER_ACCESS_REQUIRED` = access rules (`crn-access-control`).
- **Frontend**: browser console and network tab; `crn-load-state` shows the translated error. The HTTP
  cache (`core/http/cache.interceptor.ts`, 15 min default, per tab) and the service worker
  (`ngsw-config.json`, production build only) can serve stale data: reproduce with `noCache()` or a hard
  reload before blaming the backend.
- **Data**: look at the documents involved (model files in `backend/src/modules/*/*.model.ts`).

## 4. Find the root cause

Follow the datum from its source to the screen and find the first place where it is wrong:

CoC API (`lib/coc/coc-client.ts`, `live-coc.ts`) → sync service / scheduler
(`lib/scheduler/war-sync-scheduler.ts`) → MongoDB document → service / table (`lib/table/table-query.ts`)
→ route + OpenAPI model → `Http…Service` → mapper (`core/api/coc-api.mappers.ts`) → component.

Known traps worth checking early (all documented in `CLAUDE.md` "Backend notes"):
- CoC API: names in English only; `battlelog` lowercase; `capitalraidseasons` has members only for the
  ongoing weekend; private war log → `accessDenied`; CWL wars are not in `/currentwar`.
- Time: months grouped in Europe/Rome; Legend seasons end Monday 05:00 UTC; Raid Weekends Fri–Mon;
  donation counters reset at season end and when a player leaves.
- Idempotence: wars are keyed by preparation start + opponent; awards and closed selections are frozen;
  migrations re-run at every start.
- Sister clans: data stored for all three clans; periods of non-main clans carry `@<tag>` (`periodSuffix`).
- Auth: refresh rotation and grace window (`modules/auth/auth.service.ts`); roles read from the DB only on
  routes with `roles`.

Distinguish cause from symptom: "the table shows 0" is a symptom; "the war was saved before
`warEnded` and never updated because …" is a cause. State the cause in one sentence before fixing.

## 5. Fix narrowly

- Change the code where the cause is, not where the symptom shows (no frontend patch hiding wrong
  backend data, no `try/catch` swallowing errors, no `!important`/`::ng-deep` for a layout bug).
- If saved documents are already wrong, the fix may need an idempotent migration (`crn-mongo-data` skill)
  — ask the user before rewriting production data.
- Keep the diff minimal; note (do not fix) unrelated problems you met.

## 6. Prove it

1. The regression test fails without the fix and passes with it (run it both ways when practical).
2. Run the suites of the area touched, then the full checks listed in `CLAUDE.md` "Commands" if the fix
   is shared code.
3. Visual bug: check in the browser again, both themes and phone width.

## Output

To the user (English): symptom, root cause (with `path:line`), fix, regression test name, checks run and
results, residual risks (e.g. production data to repair, needs a deploy). Commit only when asked.
