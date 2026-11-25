---
name: crn-feature-development
description: Procedure to design and build a new feature of Crociata Nera end to end (Angular frontend in `src/`, Next.js backend in `backend/`), from the requirement to green checks. Use when the user asks to add or extend a page, a backend route, a table, an admin tool, an announcement kind, a commendation, a sync job or any other new behaviour; not for fixing a defect (crn-bug-investigation) nor for reviewing code (crn-code-review).
---

# Feature development

The general rules (conventions, commands, colours, sizes, i18n, BaseResult, OpenAPI, rate limits,
commit format) are in `AGENTS.md` and are not repeated here. This skill is the order of work and the
map of what a feature usually touches. Talk to the user in English, like the code, comments and tests.

## 1. Understand the requirement before touching code

Answer these questions first; ask the user only what the code and the defaults cannot settle:

- **Who sees it?** One of the access levels of `backend/src/openapi/operation.ts` (`public`, `user`,
  `clan`, `leader`, `admin`); details in the `crn-access-control` skill.
- **Which clans?** The main clan (Crociata Nera, `CLAN_TAG`) only, or every clan of the Crusade
  (`backend/src/lib/coc/crusade-clans.ts`: Nera, Rossa, d'Oro). Many features exist for the main clan only.
- **Where does the datum come from?** Live from the Clash of Clans API through the backend
  (`lib/coc/live-coc.ts`), saved by the scheduler (wars, CWL, raids, donations, legends), or entered by
  users (bases, selections, exclusions). Never from the official API in the browser.
- **Does it close periods or freeze results?** (commendations, CWL selections, announcements): then
  idempotence and "only once" rules matter — see `crn-clan-statistics` / `crn-announcements`.
- **Offline / mock behaviour:** must it work in `npm run start:mock`? (public pages and every
  `CocApiService` / `DefenseBasesService` / `CwlSelectionService` method do.) Must its GET be in the
  service worker's `clan-data` group (`ngsw-config.json`)?
- **Languages:** every new text in it-IT, en-US, es-ES; announcement texts also in
  `backend/src/modules/announcements/announcement-texts.ts`.

Restate the requirement in a few lines to the user when it is ambiguous or large.

## 2. Find the closest existing feature and copy its shape

Search before designing; most features have a sibling to mirror:

| New thing | Mirror |
|---|---|
| Read-only page with a backend table | `features/raids/raids-page.*` + `backend/src/modules/raids/raid-members.table.ts` |
| Page with admin actions and dialogs | `features/cwl-selection/` (+ `components/*-dialog.ts`) |
| User-submitted content with moderation | `features/bases/` + `features/admin/publishing/bases/` |
| Admin tab | `features/admin/publishing/publishing-page.*` tabs |
| Data synced on a schedule | a module under `backend/src/modules/*/…-sync.service.ts` called by `lib/scheduler/war-sync-scheduler.ts` |
| Live CoC datum in the official format | `GET /clan`, `/wars/current` (`modules/clan/clan-live.service.ts`) |
| PDF of a table | `features/raids/raid-members-pdf.ts` (`TablePdf`) |

Read the mirror's spec files too: they show what the project considers worth testing.

## 3. Plan the touch points

Write the list (TodoWrite or in the reply) before coding. Typical full-stack feature:

**Backend** (`backend/src/`)
1. Model (`modules/<area>/<x>.model.ts`) — indexes, migration if existing documents change → `crn-mongo-data`.
2. Service with the business logic (`modules/<area>/<x>.service.ts`), pure rules in their own file when
   they deserve unit tests (e.g. `cwl-selection.rules.ts`, `commendation-rules.ts`).
3. zod schemas (`modules/<area>/<x>.schemas.ts`), errors as `MessageKey`.
4. Route(s) + `ApiName`/`RATE_LIMITS` + OpenAPI operation and models → `crn-backend-endpoint`.
5. Table route? → `crn-server-table`.
6. Scheduler step? → `crn-game-data-sync`.

**Frontend** (`src/app/`)
1. Types in `core/backend/backend-api.types.ts` (backend-only data) or `core/models/` (CoC data mapped
   by `core/api/coc-api.mappers.ts`).
2. Data access: a method on the abstract service **and** on both implementations (`Http…` and `Mock…`,
   wired in `core/api/provide-coc-api.ts`); otherwise `npm run start:mock` breaks. Pick the cache duration
   (`cacheFor`, `noCache` in `core/http/http-cache.ts`).
3. Page / components in `features/<area>/` (separate `.ts/.html/.scss`, `crn-` prefix, `OnPush`, signals,
   `rxResource`) → `crn-frontend-ui`.
4. Route in `app.routes.ts` under the right guard group (`clanGuard`, `leaderGuard`, `adminGuard`); the
   navigation entry in `layout/shell.*` when it is a page.
5. i18n keys in the three `public/i18n/*.json` (incl. any new `ERROR.*`/`SUCCESS.*` key of the backend).
6. A new private GET joining `clan-data` in `ngsw-config.json` only if it is cleared at sign-out.

**Docs**: README (Italian) and `AGENTS.md` when they describe the behaviour you changed or a rule a future
session must know. Keep `AGENTS.md` short: one line per rule.

## 4. Implement

- Reuse before writing: shared components/directives (`crn-frontend-ui`), `lib/table`, `lib/validation/parse.ts`,
  `fromCocApi`, `PdfToolkit`, `cssColor()`. Do not add a helper used once, nor a dependency.
- Keep business rules in the backend; the frontend only shows them (KPIs computed client-side in
  `core/utils/war-stats.ts` are the documented exception).
- Follow the surrounding style: doc comment on every exported symbol explaining *why*, names in English.
- Do not change unrelated code; formatting diffs from the editor are fine.

## 5. Verify

Run the checks for what you touched (all of them before saying "done" on a full-stack feature):

```sh
cd backend && npm run typecheck && npm test         # backend + OpenAPI contract
npx tsc -p tsconfig.app.json --noEmit               # frontend types
npx ng test --watch=false                           # frontend specs (or --include <spec>)
npm run lint:colors && npm run lint:units           # styles
```

Tests to add are chosen with the `crn-testing-strategy` skill. Visual changes: check them in a real browser
(`npm run start:mock` for public/mock-able pages, otherwise ask the user to look with the backend running),
in both themes and at phone width.

## 6. Hand over

Report to the user (English): what changed and where (links `path:line`), checks run with their result,
what was not verifiable (e.g. pages needing a session), follow-ups. Commit only when asked, with the
`type(scope): :gitmoji: Description` format, staging files explicitly; production deploy happens only
through a PR merge the user asks for (`crn-release` skill).
