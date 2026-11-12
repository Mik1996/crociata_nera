# CLAUDE.md

Crociata Nera: website of the Clash of Clans clan #2J8JVVCLC (https://crociatanera.it). Wars, CWL,
Raid Weekend, players, statistics and commendations, plus user accounts linked to game accounts.

Talk to the user in **Italian**. Code, identifiers, comments, tests and i18n keys are in **English**;
Italian only in the UI translations (`public/i18n/it-IT.json`).

## Repository

| Folder | What | Stack |
|---|---|---|
| `src/` | Frontend | Angular 22 (standalone, zoneless, signals, `rxResource`), Angular Material, ngx-translate, Chart.js |
| `server/` | Proxy to the official Clash of Clans API (keeps the API token server-side) | Node, plain `.mjs` |
| `backend/` | Application backend: auth, saved wars/CWL/raids, players, commendations, scheduler | Next.js 16 route handlers, Mongoose 9, zod 4 |
| `deploy/` | Production: docker compose + Caddy on the VPS, `deploy.sh`, `backup.sh` | |

Request routing (same in dev via `proxy.conf.json` and in prod via `deploy/Caddyfile`):
`/api/coc/*` → proxy (`:3000`), `/api/v1/*` → backend (`:3001`).

## Commands

```sh
npm start                 # frontend on :4200 (needs proxy + backend for real data)
npm run start:mock        # frontend with mock data, no backend needed (no signed-in user)
npm run server            # CoC proxy on :3000 (reads root .env)
npm run backend           # backend on :3001 (reads backend/.env.local)

npx ng test --watch=false                          # frontend tests (Vitest)
npx ng test --watch=false --include <spec path>    # a single spec
npx tsc -p tsconfig.app.json --noEmit              # frontend type check
npm run lint:colors                                # colours only from the palette
npm run lint:units                                 # sizes in rem, no hard-coded pixels
npm run test:server                                # proxy tests (node:test)
cd backend && npm run typecheck && npm test        # backend type check + tests (Vitest, in-memory MongoDB)
```

CI (`.github/workflows/deploy.yml`) runs all of the above on every push; a push to `master` that passes
is **deployed automatically** to the VPS (`deploy/deploy.sh`), which restarts the backend.

## Conventions

- Every Angular component has separate `.ts` / `.html` / `.scss` files (no inline template/styles).
- Prettier: `printWidth` 100, single quotes, Angular parser for HTML. The user's editor formats on
  save, so diffs often contain formatting changes.
- Colours: the **only** place with colour literals is `src/styles/_color-palette.scss` (theme tokens
  per theme + identity tokens, grouped by meaning). Elsewhere use `var(--cn-*)`, and
  `@use 'color-palette' as palette;` + `palette.alpha(var(--cn-x), 30%)` for transparency; TS reads
  tokens with `cssColor()` (`src/app/shared/styles/css-color.ts`). `npm run lint:colors` (in CI) fails
  on any other literal.
- Sizes: rem only. Margins, paddings and gaps use `$space-xs|s|m|l|xl|xxl|xxxl`, corners
  `$radius-s|m|l|xl` from `src/styles/_variables.scss` (`@use 'variables' as *;`). Circles use
  `border-radius: 50%`, pills (wider than tall) `$radius-pill`. Negative tokens go in parentheses
  (`margin: 0 (-$space-s)`). Pixels only for hairlines (≤ 2px, border/outline widths);
  `npm run lint:units` (in CI) fails on any other px (`units-lint: allow` comment to opt out).
- New UI text: add the key to **all three** files `public/i18n/{it-IT,en-US,es-ES}.json`.
- Backend responses are `BaseResult` `{ result, messages, status }`; errors are `MessageKey` values
  (`ERROR.*` / `SUCCESS.*`) translated by the frontend. Validate input with zod (`parseBody`,
  `parseQuery`, `validate`); path params with `validate(z.object({...}), {...})`.
- Every backend route has a rate limit (`ApiName` + `RATE_LIMITS` in `backend/src/lib/http/api-name.ts`).
- Every backend route is documented in `backend/src/openapi/` (operations + response models as zod
  schemas), served as OpenAPI 3.1 at `GET /api/v1/openapi.json` and shown by Swagger UI at
  `/api/v1/docs`: public in dev; in production for administrators only (browser login dialog with
  their site username/email and password, HTTP Basic, or a Bearer token). Tests enforce it: a route
  without an entry fails `test/openapi.test.ts`, and every response received through `call()` must
  match its documented status, model (strict) and message keys (`test/contract.ts`).
- Tests: keep them green; add or update specs with every change. Backend tests call route handlers
  through `backend/test/helpers.ts` (`call(handler, { body, token, cookie, params, ip })`) and fake the
  CoC API with `mockCocApi` (`backend/test/coc-mock.ts`).
- Commit messages: `type(scope): :gitmoji: Description` in English (e.g.
  `feat(tables): :sparkles: ...`, `fix(raids): :bug: ...`), one commit per topic when asked.
  Commit or push only when the user asks.

## Frontend notes

- Tables: wrap them in `<div class="cn-table-wrap">` and import `TABLE_WRAP`
  (`src/app/shared/directives/table-wrap.ts`): sticky header + resizable columns. Header labels never wrap.
- Pages filling the viewport use `host: { class: 'page--fill' }` and a `.page__scroll` area with
  `appScrollFade` (scrollbars are hidden site-wide; the fade bands hint at more content).
- Empty/loading/error states: `<app-load-state>` (shows the clan badge in empty states, `ClanBadge`).
- Responsive layout by available width: prefer **container queries**. A container query never
  applies to the container itself, so put `container-type` on a parent. Mind rule order: base rules
  must come before the `@container` block (same specificity, later wins). Text that must fit its box
  uses `font-size: min(<normal size>, Ncqi)`; for names add a `max(<minimum>, ...)` so they wrap
  below it.
- Material tooltips set `touch-action: none`; a global rule in `styles.scss` restores scrolling.
- Signed-in user: `AuthService` (`accessToken` in memory, refresh cookie httpOnly). "Your" rows in
  tables: `isMine = inject(AuthService).isMyPlayer` and `[class.cn-row-me]="isMine(row.tag)"`.
- Check visual changes in a real browser before declaring them done (mock server
  `npm run start:mock` for public pages; pages needing a session cannot be seen in mock mode).

## Backend notes

- Linked game accounts: `User.playerTags` (verified with the in-game API token through
  `POST /players/{tag}/verifytoken`, max 10, unique across users) and `pendingPlayerTag` (old
  unverified link). Administrators can only unlink.
- Sessions: 15 min access token + 30 day rotating refresh cookie (`cn_refresh`). Reuse of a rotated
  token revokes all sessions, except within `REFRESH_REUSE_GRACE_MS` (30 s) of a rotation whose
  successor is still alive. The frontend signs out only on a 401 from refresh.
- Scheduler (`backend/src/lib/scheduler/war-sync-scheduler.ts`) syncs wars, CWL, raids and
  commendations. Commendations are awarded once per closed period and frozen.
- Donations (`donor` commendation): the in-game `memberList[].donations` counter resets when a
  player leaves the clan and at season end, so the backend adds up the counter's growth between
  reads (`DonationCounters` → `DonationTotals`, per Gold Pass season from `/goldpass/seasons/current`,
  `backend/src/modules/donations/`) and reads once more a minute before the season ends.
- Base arsenal (`backend/src/modules/bases/`): the town hall level comes from the in-game layout
  link (`TH18:HV:…`). Screenshots are shrunk in the browser (`prepareImage`), re-encoded by `sharp`
  as WebP (`thumb` 640 px, `full` 1400 px) and kept in MongoDB (`BaseImages`, behind the
  `ImageStore` interface; max 400 bases for the free cluster). `GET /base-images/{key}/{variant}` is
  public: the key is random and changes with the image, so responses are cached as immutable.
- Data migrations run at startup from `backend/src/instrumentation.ts` and must be idempotent.
- CoC API gotchas: names come back in English only; `battlelog` is lowercase; season rankings need
  `limit` 100–25000; `capitalraidseasons` lists members only for the ongoing weekend (saved by the
  backend); the official API is GET-only except `verifytoken`.

## Environments and data

- MongoDB Atlas cluster `crociata-nera-prod`: database **`Prod`** (VPS) and **`dev`** (local,
  `backend/.env.local`). Always keep the database name in `DATABASE_URL`, otherwise MongoDB silently
  uses `test`.
- Production VPS: `ssh -i ~/.ssh/crociata_vps root@217.61.63.44`, app in `~/crociata_nera/deploy`.
  Claude cannot SSH into it: give the user the commands to run there.

## Rules

- Never print, paste or commit secrets (CoC token, JWT secret, Mongo connection strings). Check env
  files by variable name only; mask URIs with `sed -E 's#://[^@]*@#://***@#'`.
- Never commit `.vscode/settings.json`, `.env`, `backend/.env.local`, `deploy/.env`. Stage files
  explicitly, never `git add -A`.
- `../continental_be` is a reference only: never modify it.
- The frontend keeps calling the Clash of Clans API through the proxy (`/api/coc`): do not replace
  that integration with the backend.
- Respect the Supercell Fan Content Policy: keep the always-visible footer notice, no monetisation
  of features, do not modify Supercell assets.
